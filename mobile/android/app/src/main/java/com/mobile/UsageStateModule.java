// mobile/android/app/src/main/java/com/mobile/UsageStatsModule.java
package com.mobile;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Process;
import android.provider.Settings;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;

import java.util.Calendar;
import java.util.List;
import java.util.Map;

public class UsageStatsModule extends ReactContextBaseJavaModule {
    private static final String MODULE_NAME = "UsageStatsModule";
    private UsageStatsManager usageStatsManager;
    private PackageManager packageManager;

    public UsageStatsModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.usageStatsManager = (UsageStatsManager) reactContext.getSystemService(Context.USAGE_STATS_SERVICE);
        this.packageManager = reactContext.getPackageManager();
    }

    @Override
    public String getName() {
        return MODULE_NAME;
    }

    /**
     * Verificar si tenemos permisos de Usage Stats
     */
    @ReactMethod
    public void hasUsageStatsPermission(Promise promise) {
        try {
            AppOpsManager appOps = (AppOpsManager) getReactApplicationContext()
                    .getSystemService(Context.APP_OPS_SERVICE);
            
            int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), getReactApplicationContext().getPackageName());
            
            boolean hasPermission = mode == AppOpsManager.MODE_ALLOWED;
            promise.resolve(hasPermission);
        } catch (Exception e) {
            promise.reject("ERROR_CHECKING_PERMISSION", e.getMessage(), e);
        }
    }

    /**
     * Solicitar permisos de Usage Stats (redirigir a configuración)
     */
    @ReactMethod
    public void requestUsageStatsPermission(Promise promise) {
        try {
            Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getReactApplicationContext().startActivity(intent);
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR_REQUESTING_PERMISSION", e.getMessage(), e);
        }
    }

    /**
     * Obtener estadísticas de uso de aplicaciones
     */
    @ReactMethod
    public void getUsageStats(double startTime, double endTime, Promise promise) {
        try {
            // Verificar permisos primero
            if (!hasUsageStatsPermissionSync()) {
                promise.reject("NO_PERMISSION", "Usage stats permission not granted");
                return;
            }

            long start = (long) startTime;
            long end = (long) endTime;

            Map<String, UsageStats> stats = usageStatsManager.queryAndAggregateUsageStats(start, end);
            WritableArray usageArray = Arguments.createArray();

            for (Map.Entry<String, UsageStats> entry : stats.entrySet()) {
                UsageStats usageStats = entry.getValue();
                
                // Filtrar solo apps con tiempo de uso significativo (más de 1 segundo)
                if (usageStats.getTotalTimeInForeground() > 1000) {
                    WritableMap usageMap = Arguments.createMap();
                    
                    usageMap.putString("packageName", usageStats.getPackageName());
                    usageMap.putString("appName", getAppName(usageStats.getPackageName()));
                    usageMap.putDouble("totalTimeForeground", (double) usageStats.getTotalTimeInForeground());
                    usageMap.putDouble("firstTimeStamp", (double) usageStats.getFirstTimeStamp());
                    usageMap.putDouble("lastTimeStamp", (double) usageStats.getLastTimeStamp());
                    usageMap.putDouble("lastTimeUsed", (double) usageStats.getLastTimeUsed());
                    
                    usageArray.pushMap(usageMap);
                }
            }

            promise.resolve(usageArray);
        } catch (Exception e) {
            promise.reject("ERROR_GETTING_USAGE_STATS", e.getMessage(), e);
        }
    }

    /**
     * Obtener la aplicación actualmente en primer plano
     */
    @ReactMethod
    public void getCurrentForegroundApp(Promise promise) {
        try {
            if (!hasUsageStatsPermissionSync()) {
                promise.reject("NO_PERMISSION", "Usage stats permission not granted");
                return;
            }

            // Obtener stats de los últimos minutos
            long currentTime = System.currentTimeMillis();
            long startTime = currentTime - (2 * 60 * 1000); // Últimos 2 minutos

            List<UsageStats> statsList = usageStatsManager.queryUsageStats(
                    UsageStatsManager.INTERVAL_BEST, startTime, currentTime);

            if (statsList == null || statsList.isEmpty()) {
                promise.resolve(null);
                return;
            }

            // Encontrar la app con el último timestamp de uso
            UsageStats recentStats = null;
            long lastTimeUsed = 0;

            for (UsageStats stats : statsList) {
                if (stats.getLastTimeUsed() > lastTimeUsed) {
                    lastTimeUsed = stats.getLastTimeUsed();
                    recentStats = stats;
                }
            }

            if (recentStats != null) {
                WritableMap currentApp = Arguments.createMap();
                currentApp.putString("packageName", recentStats.getPackageName());
                currentApp.putString("appName", getAppName(recentStats.getPackageName()));
                currentApp.putDouble("lastTimeUsed", (double) recentStats.getLastTimeUsed());
                
                promise.resolve(currentApp);
            } else {
                promise.resolve(null);
            }
        } catch (Exception e) {
            promise.reject("ERROR_GETTING_CURRENT_APP", e.getMessage(), e);
        }
    }

    /**
     * Obtener estadísticas diarias (hoy)
     */
    @ReactMethod
    public void getTodayUsageStats(Promise promise) {
        try {
            if (!hasUsageStatsPermissionSync()) {
                promise.reject("NO_PERMISSION", "Usage stats permission not granted");
                return;
            }

            // Configurar tiempo para hoy (desde medianoche)
            Calendar calendar = Calendar.getInstance();
            calendar.set(Calendar.HOUR_OF_DAY, 0);
            calendar.set(Calendar.MINUTE, 0);
            calendar.set(Calendar.SECOND, 0);
            calendar.set(Calendar.MILLISECOND, 0);
            
            long startOfDay = calendar.getTimeInMillis();
            long endOfDay = System.currentTimeMillis();

            getUsageStats((double) startOfDay, (double) endOfDay, promise);
        } catch (Exception e) {
            promise.reject("ERROR_GETTING_TODAY_STATS", e.getMessage(), e);
        }
    }

    /**
     * Obtener información de aplicaciones instaladas
     */
    @ReactMethod
    public void getInstalledApps(Promise promise) {
        try {
            List<ApplicationInfo> apps = packageManager.getInstalledApplications(
                    PackageManager.GET_META_DATA);
            
            WritableArray appsArray = Arguments.createArray();

            for (ApplicationInfo app : apps) {
                // Filtrar solo apps de usuario (no del sistema)
                if ((app.flags & ApplicationInfo.FLAG_SYSTEM) == 0) {
                    WritableMap appMap = Arguments.createMap();
                    
                    appMap.putString("packageName", app.packageName);
                    appMap.putString("appName", getAppName(app.packageName));
                    appMap.putString("category", getAppCategory(app));
                    
                    appsArray.pushMap(appMap);
                }
            }

            promise.resolve(appsArray);
        } catch (Exception e) {
            promise.reject("ERROR_GETTING_INSTALLED_APPS", e.getMessage(), e);
        }
    }

    /**
     * Verificar permisos de forma sincrónica
     */
    private boolean hasUsageStatsPermissionSync() {
        try {
            AppOpsManager appOps = (AppOpsManager) getReactApplicationContext()
                    .getSystemService(Context.APP_OPS_SERVICE);
            
            int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,
                    Process.myUid(), getReactApplicationContext().getPackageName());
            
            return mode == AppOpsManager.MODE_ALLOWED;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Obtener nombre legible de la aplicación
     */
    private String getAppName(String packageName) {
        try {
            ApplicationInfo appInfo = packageManager.getApplicationInfo(packageName, 0);
            return packageManager.getApplicationLabel(appInfo).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return packageName; // Fallback al nombre del paquete
        }
    }

    /**
     * Categorizar aplicación basada en el nombre del paquete
     */
    private String getAppCategory(ApplicationInfo appInfo) {
        String packageName = appInfo.packageName.toLowerCase();
        
        // Redes sociales
        if (packageName.contains("facebook") || packageName.contains("instagram") || 
            packageName.contains("twitter") || packageName.contains("snapchat") ||
            packageName.contains("tiktok") || packageName.contains("whatsapp") ||
            packageName.contains("telegram") || packageName.contains("discord")) {
            return "social";
        }
        
        // Juegos
        if (packageName.contains("game") || packageName.contains("play") ||
            packageName.contains("minecraft") || packageName.contains("roblox") ||
            packageName.contains("pubg") || packageName.contains("fortnite")) {
            return "games";
        }
        
        // Educación
        if (packageName.contains("edu") || packageName.contains("learn") ||
            packageName.contains("school") || packageName.contains("study") ||
            packageName.contains("duolingo") || packageName.contains("khan")) {
            return "educational";
        }
        
        // Productividad
        if (packageName.contains("office") || packageName.contains("docs") ||
            packageName.contains("sheets") || packageName.contains("calendar") ||
            packageName.contains("notes") || packageName.contains("adobe")) {
            return "productivity";
        }
        
        return "other";
    }

    /**
     * Obtener estadísticas detalladas por intervalos
     */
    @ReactMethod
    public void getDetailedUsageStats(double startTime, double endTime, String interval, Promise promise) {
        try {
            if (!hasUsageStatsPermissionSync()) {
                promise.reject("NO_PERMISSION", "Usage stats permission not granted");
                return;
            }

            int intervalType;
            switch (interval.toLowerCase()) {
                case "daily":
                    intervalType = UsageStatsManager.INTERVAL_DAILY;
                    break;
                case "weekly":
                    intervalType = UsageStatsManager.INTERVAL_WEEKLY;
                    break;
                case "monthly":
                    intervalType = UsageStatsManager.INTERVAL_MONTHLY;
                    break;
                case "yearly":
                    intervalType = UsageStatsManager.INTERVAL_YEARLY;
                    break;
                default:
                    intervalType = UsageStatsManager.INTERVAL_BEST;
                    break;
            }

            long start = (long) startTime;
            long end = (long) endTime;

            List<UsageStats> statsList = usageStatsManager.queryUsageStats(intervalType, start, end);
            WritableArray usageArray = Arguments.createArray();

            if (statsList != null) {
                for (UsageStats stats : statsList) {
                    if (stats.getTotalTimeInForeground() > 1000) { // Más de 1 segundo
                        WritableMap usageMap = Arguments.createMap();
                        
                        usageMap.putString("packageName", stats.getPackageName());
                        usageMap.putString("appName", getAppName(stats.getPackageName()));
                        usageMap.putDouble("totalTimeForeground", (double) stats.getTotalTimeInForeground());
                        usageMap.putDouble("firstTimeStamp", (double) stats.getFirstTimeStamp());
                        usageMap.putDouble("lastTimeStamp", (double) stats.getLastTimeStamp());
                        usageMap.putDouble("lastTimeUsed", (double) stats.getLastTimeUsed());
                        
                        // Información adicional disponible en Android API 28+
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                            usageMap.putDouble("totalTimeVisible", (double) stats.getTotalTimeVisible());
                        }
                        
                        usageArray.pushMap(usageMap);
                    }
                }
            }

            promise.resolve(usageArray);
        } catch (Exception e) {
            promise.reject("ERROR_GETTING_DETAILED_STATS", e.getMessage(), e);
        }
    }
}