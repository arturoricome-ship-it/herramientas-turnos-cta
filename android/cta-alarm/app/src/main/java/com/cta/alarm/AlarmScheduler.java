package com.cta.alarm;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

public final class AlarmScheduler {
    public static final String EXTRA_AT = "cta_alarm_at";
    public static final String EXTRA_LABEL = "cta_alarm_label";

    private AlarmScheduler() {}

    public static void schedule(Context context, long triggerAtMillis, String label) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager == null) throw new IllegalStateException("AlarmManager no disponible");

        int requestCode = requestCode(triggerAtMillis);

        Intent fireIntent = new Intent(context, AlarmReceiver.class)
                .setAction("com.cta.alarm.FIRE")
                .putExtra(EXTRA_AT, triggerAtMillis)
                .putExtra(EXTRA_LABEL, label);
        PendingIntent firePending = PendingIntent.getBroadcast(
                context,
                requestCode,
                fireIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Intent showIntent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent showPending = PendingIntent.getActivity(
                context,
                requestCode + 1,
                showIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        AlarmManager.AlarmClockInfo info = new AlarmManager.AlarmClockInfo(triggerAtMillis, showPending);
        alarmManager.setAlarmClock(info, firePending);
    }

    private static int requestCode(long value) {
        long mixed = value ^ (value >>> 32);
        return (int) (mixed & 0x7fffffff);
    }
}
