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

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationTrackingService extends Service implements LocationListener {
    private static final String CHANNEL_ID = "retiradas_live_location";
    private static final String ALERT_CHANNEL_ID = "retiradas_nearby_orders";
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
        createChannels();
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

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Localização em tempo real", NotificationManager.IMPORTANCE_LOW);
        channel.setDescription("Mantém a localização operacional do técnico atualizada.");
        channel.setShowBadge(false);
        NotificationChannel alerts = new NotificationChannel(ALERT_CHANNEL_ID, "Retiradas próximas", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Avisa quando existe uma retirada aberta próxima ao técnico.");
        alerts.enableVibration(true);
        alerts.setShowBadge(true);
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(channel);
        manager.createNotificationChannel(alerts);
    }

    private Notification createNotification() {
        Intent openIntent = new Intent(this, LauncherActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL_ID)
                : new Notification.Builder(this);
        return builder.setContentTitle("Retiradas em operação")
                .setContentText("Localização em tempo real ativa")
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
            String response = readResponse(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            if (status >= 200 && status < 300) showNativeRadarNotification(response);
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

    private static String readResponse(InputStream input) throws Exception {
        if (input == null) return "{}";
        StringBuilder result = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) result.append(line);
        }
        return result.toString();
    }

    private void showNativeRadarNotification(String response) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return;
            JSONObject radar = new JSONObject(response).optJSONObject("radar");
            JSONObject notification = radar == null ? null : radar.optJSONObject("nativeNotification");
            if (notification == null) return;
            String alertId = notification.optString("id", "");
            String title = notification.optString("title", "Retirada próxima de você");
            String message = notification.optString("message", "Existe uma retirada aberta próxima da sua localização.");
            String targetPath = notification.optString("targetPath", "/maps");
            if (alertId.isEmpty()) return;

            Intent openIntent = new Intent(this, LauncherActivity.class)
                    .setAction(Intent.ACTION_VIEW)
                    .setData(android.net.Uri.parse("https://retiradas.tech" + targetPath));
            int alertNotificationId = 20_000 + Math.abs(alertId.hashCode() % 100_000);
            PendingIntent pending = PendingIntent.getActivity(
                    this,
                    alertNotificationId,
                    openIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Notification.Builder(this, ALERT_CHANNEL_ID)
                    : new Notification.Builder(this).setPriority(Notification.PRIORITY_HIGH);
            Notification alert = builder
                    .setContentTitle(title)
                    .setContentText(message)
                    .setStyle(new Notification.BigTextStyle().bigText(message))
                    .setSmallIcon(R.drawable.ic_notification_icon)
                    .setContentIntent(pending)
                    .setAutoCancel(true)
                    .setCategory(Notification.CATEGORY_RECOMMENDATION)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .build();
            getSystemService(NotificationManager.class).notify(alertNotificationId, alert);
        } catch (Exception ignored) {
            // Uma resposta incompleta nao pode interromper o rastreamento nativo.
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
