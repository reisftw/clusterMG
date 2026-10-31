package br.com.brasiltecpar.retiradas;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationTrackingService extends Service implements LocationListener {
    private static final String CHANNEL_ID = "retiradas_live_location";
    private static final int NOTIFICATION_ID = 1202;
    private static final long MIN_TIME_MS = 30_000L;
    private static final float MIN_DISTANCE_METERS = 15f;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private LocationManager locationManager;
    private long lastSentAt = 0L;

    static void start(Context context) {
        Intent intent = new Intent(context, LocationTrackingService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
        else context.startService(intent);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, createNotification());
        locationManager = (LocationManager) getSystemService(LOCATION_SERVICE);
        beginLocationUpdates();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!SecureTokenStore.hasToken(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }
        beginLocationUpdates();
        return START_STICKY;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Localizacao em tempo real", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Mantem a localizacao operacional do tecnico atualizada.");
        channel.setShowBadge(false);
        getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    private Notification createNotification() {
        Intent openIntent = new Intent(this, LauncherActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder.setContentTitle("Retiradas em operacao")
                .setContentText("Localizacao em tempo real ativa")
                .setSmallIcon(R.drawable.ic_notification_icon)
                .setContentIntent(pending)
                .setOngoing(true)
                .setCategory(Notification.CATEGORY_SERVICE)
                .build();
    }

    private void beginLocationUpdates() {
        if (locationManager == null || checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return;
        try {
            locationManager.removeUpdates(this);
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, MIN_TIME_MS, MIN_DISTANCE_METERS, this);
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, MIN_TIME_MS, MIN_DISTANCE_METERS, this);
            }
        } catch (RuntimeException ignored) {
            // O Android pode alterar o provedor enquanto a tela de permissao esta aberta.
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        long now = System.currentTimeMillis();
        if (location == null || now - lastSentAt < MIN_TIME_MS) return;
        lastSentAt = now;
        networkExecutor.execute(() -> sendLocation(location));
    }

    private void sendLocation(Location location) {
        String token = SecureTokenStore.readToken(this);
        if (token.isEmpty()) {
            stopSelf();
            return;
        }
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL("https://retiradas.tech/api/maintenance/app/location").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Device " + token);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("X-Retiradas-Client", "android-native");
            JSONObject payload = new JSONObject();
            payload.put("latitude", location.getLatitude());
            payload.put("longitude", location.getLongitude());
            payload.put("accuracy", location.hasAccuracy() ? location.getAccuracy() : JSONObject.NULL);
            payload.put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
            payload.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
            payload.put("timestamp", location.getTime());
            payload.put("appVersion", BuildConfig.VERSION_NAME);
            byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(body);
            }
            int status = connection.getResponseCode();
            try (InputStream ignored = status >= 400 ? connection.getErrorStream() : connection.getInputStream()) {
                // Consumir a resposta permite reutilizacao correta da conexao.
            }
            if (status == 401 || status == 403) {
                SecureTokenStore.clear(this);
                stopSelf();
            }
        } catch (Exception ignored) {
            // A proxima leitura de GPS tenta novamente sem bloquear o aplicativo.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    @Override public void onProviderEnabled(String provider) { beginLocationUpdates(); }
    @Override public void onProviderDisabled(String provider) {}

    @Override
    public void onDestroy() {
        if (locationManager != null) locationManager.removeUpdates(this);
        networkExecutor.shutdownNow();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
