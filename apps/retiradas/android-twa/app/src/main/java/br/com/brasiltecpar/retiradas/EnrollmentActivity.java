package br.com.brasiltecpar.retiradas;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class EnrollmentActivity extends Activity {
    private static final int PERMISSION_REQUEST = 1202;
    private String enrollmentCode = "";
    private String appVersion = BuildConfig.VERSION_NAME;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Uri data = getIntent().getData();
        if (data != null && "stop-location".equals(data.getHost())) {
            LocationTrackingService.stop(this);
            finishIntoApp(false, "Localizacao em tempo real desativada.");
            return;
        }
        enrollmentCode = data == null ? "" : String.valueOf(data.getQueryParameter("code"));
        String requestedVersion = data == null ? "" : data.getQueryParameter("version");
        if (requestedVersion != null && !requestedVersion.isEmpty()) appVersion = requestedVersion;
        if (enrollmentCode.isEmpty() || "null".equals(enrollmentCode)) {
            finishIntoApp(false, "Codigo de ativacao ausente.");
            return;
        }
        requestRequiredPermissions();
    }

    private void requestRequiredPermissions() {
        List<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.ACCESS_FINE_LOCATION);
            missing.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        if (missing.isEmpty()) exchangeCode();
        else requestPermissions(missing.toArray(new String[0]), PERMISSION_REQUEST);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != PERMISSION_REQUEST) return;
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            finishIntoApp(false, "A localizacao precisa ser autorizada para ativar o rastreamento.");
            return;
        }
        exchangeCode();
    }

    private void exchangeCode() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL("https://retiradas.tech/api/maintenance/app/enrollment/exchange").openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("X-Retiradas-Client", "android-native");
                JSONObject payload = new JSONObject();
                payload.put("code", enrollmentCode);
                payload.put("installationId", SecureTokenStore.installationId(this));
                payload.put("appVersion", BuildConfig.VERSION_NAME);
                payload.put("deviceName", Build.MANUFACTURER + " " + Build.MODEL);
                payload.put("platformVersion", "Android " + Build.VERSION.RELEASE);
                byte[] body = payload.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
                int status = connection.getResponseCode();
                String response = readResponse(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
                if (status < 200 || status >= 300) throw new IllegalStateException(new JSONObject(response).optString("error", "Falha na ativacao."));
                String token = new JSONObject(response).optString("token", "");
                if (token.isEmpty()) throw new IllegalStateException("Token do dispositivo nao recebido.");
                SecureTokenStore.saveToken(this, token);
                runOnUiThread(() -> {
                    LocationTrackingService.start(this);
                    finishIntoApp(true, "Localizacao em tempo real ativada.");
                });
            } catch (Exception error) {
                runOnUiThread(() -> finishIntoApp(false, error.getMessage() == null ? "Falha na ativacao." : error.getMessage()));
            } finally {
                if (connection != null) connection.disconnect();
            }
        }).start();
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

    private void finishIntoApp(boolean enrolled, String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
        Uri target = Uri.parse("https://retiradas.tech/app?source=android&appVersion=" + BuildConfig.VERSION_NAME
                + "&appCode=" + BuildConfig.VERSION_CODE + "&nativeEnrolled=" + (enrolled ? "1" : "0"));
        startActivity(new Intent(Intent.ACTION_VIEW, target).setPackage(getPackageName()));
        finish();
    }
}
