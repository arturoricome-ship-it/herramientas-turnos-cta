package com.cta.alarm;

import android.Manifest;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.DateFormat;
import java.util.Date;

public class MainActivity extends Activity {
    private static final String PREFS = "cta_alarm_prefs";
    private static final String KEY_AT = "pending_at";
    private static final String KEY_LABEL = "pending_label";
    private static final String KEY_EXACT_ASKED = "exact_asked";
    private static final String KEY_FSI_ASKED = "fsi_asked";
    private static final int REQ_NOTIFICATIONS = 41;

    private SharedPreferences prefs;
    private TextView status;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        setContentView(buildView());
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (prefs.getLong(KEY_AT, 0L) > System.currentTimeMillis()) {
            status.postDelayed(() -> attemptSchedule(false), 250);
        }
    }

    private void handleIntent(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "ctaalarm".equalsIgnoreCase(data.getScheme()) && "set".equalsIgnoreCase(data.getHost())) {
            long at = parseLong(data.getQueryParameter("at"));
            String label = data.getQueryParameter("label");
            if (label == null || label.trim().isEmpty()) label = "Turno CTA";
            if (at <= System.currentTimeMillis()) {
                setStatus("La hora solicitada ya ha pasado.", true);
                return;
            }
            savePending(at, label);
            attemptSchedule(false);
        } else if (prefs.getLong(KEY_AT, 0L) == 0L) {
            setStatus("CTA Alarma está instalada.\n\nDesde el calendario de CTA pulsa “CTA exacta” para crear una alarma con fecha y hora exactas.", false);
        }
    }

    private void savePending(long at, String label) {
        prefs.edit()
                .putLong(KEY_AT, at)
                .putString(KEY_LABEL, label)
                .putBoolean(KEY_EXACT_ASKED, false)
                .putBoolean(KEY_FSI_ASKED, false)
                .apply();
    }

    private void clearPending() {
        prefs.edit().remove(KEY_AT).remove(KEY_LABEL).apply();
    }

    private void attemptSchedule(boolean forcePermissionScreen) {
        long at = prefs.getLong(KEY_AT, 0L);
        String label = prefs.getString(KEY_LABEL, "Turno CTA");
        if (at <= System.currentTimeMillis()) {
            if (at != 0L) clearPending();
            return;
        }

        AlarmManager alarmManager = (AlarmManager) getSystemService(ALARM_SERVICE);
        if (alarmManager == null) {
            setStatus("Android no ofrece el servicio de alarmas en este dispositivo.", true);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            boolean asked = prefs.getBoolean(KEY_EXACT_ASKED, false);
            if (forcePermissionScreen || !asked) {
                prefs.edit().putBoolean(KEY_EXACT_ASKED, true).apply();
                setStatus("Activa “Alarmas y recordatorios” para CTA Alarma y vuelve atrás.", false);
                try {
                    Intent settings = new Intent(
                            Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                            Uri.parse("package:" + getPackageName())
                    );
                    startActivity(settings);
                } catch (Exception ignored) {
                    startActivity(new Intent(Settings.ACTION_SETTINGS));
                }
            } else {
                setStatus("Falta el permiso “Alarmas y recordatorios”. Pulsa REINTENTAR PERMISOS.", true);
            }
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            setStatus("Permite las notificaciones para que la alarma pueda sonar y mostrarse.", false);
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFICATIONS);
            return;
        }

        boolean fullScreenAllowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            NotificationManager notificationManager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            fullScreenAllowed = notificationManager != null && notificationManager.canUseFullScreenIntent();
            boolean asked = prefs.getBoolean(KEY_FSI_ASKED, false);
            if (!fullScreenAllowed && (forcePermissionScreen || !asked)) {
                prefs.edit().putBoolean(KEY_FSI_ASKED, true).apply();
                setStatus("Para que pueda encender la pantalla bloqueada, permite las alarmas a pantalla completa y vuelve atrás.", false);
                try {
                    Intent settings = new Intent(
                            Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                            Uri.parse("package:" + getPackageName())
                    );
                    startActivity(settings);
                    return;
                } catch (Exception ignored) {
                    // Si el fabricante no ofrece esta pantalla, se programa igualmente.
                }
            }
        }

        try {
            AlarmScheduler.schedule(this, at, label);
            clearPending();
            String when = DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(at));
            String extra = fullScreenAllowed ? "" : "\n\nLa pantalla completa no está autorizada; Android mostrará la alarma como aviso urgente.";
            setStatus("✅ Alarma exacta creada\n" + when + "\n" + label + extra, false);
        } catch (SecurityException error) {
            setStatus("Android ha bloqueado la alarma exacta. Pulsa REINTENTAR PERMISOS.", true);
        } catch (Exception error) {
            setStatus("No se pudo crear la alarma: " + error.getMessage(), true);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFICATIONS) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                attemptSchedule(false);
            } else {
                setStatus("Sin permiso de notificaciones la alarma CTA no puede avisarte.", true);
            }
        }
    }

    private LinearLayout buildView() {
        int pad = dp(22);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.rgb(10, 20, 33));

        TextView title = new TextView(this);
        title.setText("CTA ALARMA");
        title.setTextSize(30);
        title.setTextColor(Color.rgb(218, 186, 77));
        title.setGravity(Gravity.CENTER);
        root.addView(title, fullWrap());

        status = new TextView(this);
        status.setTextSize(16);
        status.setTextColor(Color.rgb(225, 230, 238));
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(28), 0, dp(28));
        root.addView(status, fullWrap());

        Button retry = button("REINTENTAR PERMISOS");
        retry.setOnClickListener(v -> {
            prefs.edit().putBoolean(KEY_EXACT_ASKED, false).putBoolean(KEY_FSI_ASKED, false).apply();
            attemptSchedule(true);
        });
        root.addView(retry, buttonParams());

        Button test = button("PRUEBA EN 1 MINUTO");
        LinearLayout.LayoutParams testLp = buttonParams();
        testLp.topMargin = dp(12);
        test.setOnClickListener(v -> {
            savePending(System.currentTimeMillis() + 60_000L, "Prueba CTA · Alarma en 1 minuto");
            attemptSchedule(true);
        });
        root.addView(test, testLp);

        Button close = button("CERRAR");
        LinearLayout.LayoutParams closeLp = buttonParams();
        closeLp.topMargin = dp(12);
        close.setOnClickListener(v -> finish());
        root.addView(close, closeLp);

        return root;
    }

    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text);
        button.setTextSize(14);
        button.setTextColor(Color.WHITE);
        button.setBackgroundColor(Color.rgb(37, 65, 99));
        return button;
    }

    private LinearLayout.LayoutParams fullWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private LinearLayout.LayoutParams buttonParams() {
        return new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
    }

    private void setStatus(String text, boolean error) {
        if (status == null) return;
        status.setText(text);
        status.setTextColor(error ? Color.rgb(248, 113, 113) : Color.rgb(225, 230, 238));
    }

    private long parseLong(String value) {
        try { return Long.parseLong(value == null ? "0" : value); }
        catch (Exception ignored) { return 0L; }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
