package com.cta.alarm;

import android.app.Activity;
import android.app.NotificationManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.DateFormat;
import java.util.Date;

public class AlarmActivity extends Activity {
    private long originalAt;
    private String label;
    private int notificationId;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        originalAt = getIntent().getLongExtra(AlarmScheduler.EXTRA_AT, System.currentTimeMillis());
        label = getIntent().getStringExtra(AlarmScheduler.EXTRA_LABEL);
        if (label == null || label.trim().isEmpty()) label = "Turno CTA";
        notificationId = getIntent().getIntExtra(
                AlarmReceiver.EXTRA_NOTIFICATION_ID,
                AlarmReceiver.notificationId(originalAt)
        );

        setContentView(buildView());
    }

    private LinearLayout buildView() {
        int pad = dp(24);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(pad, pad, pad, pad);
        root.setBackgroundColor(Color.rgb(10, 20, 33));

        TextView title = text("CTA · DESPERTADOR", 20, Color.rgb(218, 186, 77));
        title.setGravity(Gravity.CENTER);
        root.addView(title, matchWrap());

        TextView time = text(DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date()), 54, Color.WHITE);
        time.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams timeLp = matchWrap();
        timeLp.topMargin = dp(24);
        root.addView(time, timeLp);

        TextView message = text(label, 18, Color.rgb(225, 230, 238));
        message.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams msgLp = matchWrap();
        msgLp.topMargin = dp(12);
        msgLp.bottomMargin = dp(34);
        root.addView(message, msgLp);

        Button stop = new Button(this);
        stop.setText("DETENER ALARMA");
        stop.setTextSize(17);
        stop.setTextColor(Color.WHITE);
        stop.setBackgroundColor(Color.rgb(190, 45, 45));
        stop.setOnClickListener(v -> stopAlarm());
        root.addView(stop, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(58)));

        Button snooze = new Button(this);
        snooze.setText("POSPONER 5 MIN");
        snooze.setTextSize(15);
        snooze.setTextColor(Color.WHITE);
        snooze.setBackgroundColor(Color.rgb(42, 91, 145));
        LinearLayout.LayoutParams snoozeLp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54));
        snoozeLp.topMargin = dp(14);
        root.addView(snooze, snoozeLp);
        snooze.setOnClickListener(v -> snooze());

        return root;
    }

    private void stopAlarm() {
        cancelNotification();
        finishAndRemoveTask();
    }

    private void snooze() {
        cancelNotification();
        long next = System.currentTimeMillis() + 5L * 60L * 1000L;
        try {
            AlarmScheduler.schedule(this, next, label + " · Pospuesta 5 min");
        } catch (Exception ignored) {
        }
        finishAndRemoveTask();
    }

    private void cancelNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(notificationId);
    }

    @Override
    public void onBackPressed() {
        // Evita cerrar accidentalmente la alarma sin detener el sonido.
    }

    private TextView text(String value, float sizeSp, int color) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        return view;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
