package com.cta.alarm;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;

public class AlarmReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "cta_alarm_clock";
    public static final String EXTRA_NOTIFICATION_ID = "cta_notification_id";

    @Override
    public void onReceive(Context context, Intent intent) {
        long at = intent.getLongExtra(AlarmScheduler.EXTRA_AT, System.currentTimeMillis());
        String label = intent.getStringExtra(AlarmScheduler.EXTRA_LABEL);
        if (label == null || label.trim().isEmpty()) label = "Turno CTA";

        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        ensureChannel(manager);

        int notificationId = notificationId(at);
        Intent alarmScreen = new Intent(context, AlarmActivity.class)
                .putExtra(AlarmScheduler.EXTRA_AT, at)
                .putExtra(AlarmScheduler.EXTRA_LABEL, label)
                .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent fullScreen = PendingIntent.getActivity(
                context,
                notificationId,
                alarmScreen,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                .setContentTitle("CTA · Hora de levantarse")
                .setContentText(label)
                .setCategory(Notification.CATEGORY_ALARM)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setPriority(Notification.PRIORITY_MAX)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(fullScreen)
                .setFullScreenIntent(fullScreen, true)
                .build();
        notification.flags |= Notification.FLAG_INSISTENT | Notification.FLAG_NO_CLEAR;

        try {
            manager.notify(notificationId, notification);
        } catch (SecurityException ignored) {
            // Sin permiso de notificaciones Android no permite mostrar la alarma.
        }
    }

    private void ensureChannel(NotificationManager manager) {
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        AudioAttributes audio = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Alarmas CTA",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Alarmas exactas creadas desde el calendario CTA");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 700, 400, 700, 400, 900});
        channel.setSound(sound, audio);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    public static int notificationId(long value) {
        long mixed = value ^ (value >>> 32);
        return 10000 + (int) (mixed & 0x3fffffff);
    }
}
