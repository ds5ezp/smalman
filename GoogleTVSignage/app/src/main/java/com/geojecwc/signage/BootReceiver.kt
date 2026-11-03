package com.geojecwc.signage

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 구글 TV를 켜면 사이니지 앱을 자동으로 실행합니다.
 * (구글 TV의 부팅 후 자동 실행 정책이 바뀌면 TV 설정에서 확인해 주세요.)
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent?) {
        if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
        val launch = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(launch)
    }
}
