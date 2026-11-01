package br.com.brasiltecpar.retiradas;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Toast;

import com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity;

public class NotificationSettingsActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1303;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST
            );
            return;
        }
        openRetiradasSiteSettings();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != NOTIFICATION_PERMISSION_REQUEST) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            openRetiradasSiteSettings();
            return;
        }
        openApplicationNotificationSettings();
    }

    private void openRetiradasSiteSettings() {
        Toast.makeText(
                this,
                "Permita as notificacoes do site Retiradas e depois volte ao aplicativo.",
                Toast.LENGTH_LONG
        ).show();
        Intent intent = new Intent(this, ManageDataLauncherActivity.class);
        intent.setAction(ManageDataLauncherActivity.ACTION_MANAGE_TRUSTED_WEB_ACTIVITY_DATA);
        startActivity(intent);
        finish();
    }

    private void openApplicationNotificationSettings() {
        Toast.makeText(
                this,
                "Ative as notificacoes do aplicativo Retiradas.",
                Toast.LENGTH_LONG
        ).show();
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        startActivity(intent);
        finish();
    }
}
