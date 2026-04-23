package com.hrmsapp

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.atomic.AtomicBoolean

class HRMSLocationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "HRMSLocationModule"

  @ReactMethod
  fun getCurrentPosition(timeoutMs: Double, promise: Promise) {
    val locationManager =
      reactContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
        ?: run {
          promise.reject("LOCATION_UNAVAILABLE", "Device location service is unavailable.")
          return
        }

    if (!hasLocationPermission()) {
      promise.reject("LOCATION_PERMISSION_DENIED", "Location permission denied.")
      return
    }

    val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
    val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    if (!isGpsEnabled && !isNetworkEnabled) {
      promise.reject("LOCATION_DISABLED", "GPS is disabled or location is unavailable.")
      return
    }

    val provider = when {
      isGpsEnabled -> LocationManager.GPS_PROVIDER
      isNetworkEnabled -> LocationManager.NETWORK_PROVIDER
      else -> null
    }

    if (provider == null) {
      promise.reject("LOCATION_UNAVAILABLE", "Device location service is unavailable.")
      return
    }

    requestLocation(locationManager, provider, timeoutMs.toLong(), promise)
  }

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(reactContext, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

  @SuppressLint("MissingPermission")
  private fun requestLocation(
    locationManager: LocationManager,
    provider: String,
    timeoutMs: Long,
    promise: Promise,
  ) {
    val resolved = AtomicBoolean(false)
    val handler = Handler(Looper.getMainLooper())

    val timeoutRunnable = Runnable {
      if (resolved.compareAndSet(false, true)) {
        promise.reject("LOCATION_TIMEOUT", "Location fetch timed out.")
      }
    }

    fun resolveLocation(location: Location?) {
      if (location == null) {
        if (resolved.compareAndSet(false, true)) {
          promise.reject("LOCATION_UNAVAILABLE", "Device location service is unavailable.")
        }
        return
      }

      if (resolved.compareAndSet(false, true)) {
        handler.removeCallbacks(timeoutRunnable)
        val payload = Arguments.createMap().apply {
          putDouble("latitude", location.latitude)
          putDouble("longitude", location.longitude)
          putDouble("accuracy", location.accuracy.toDouble())
        }
        promise.resolve(payload)
      }
    }

    handler.postDelayed(timeoutRunnable, timeoutMs.coerceAtLeast(1_000L))

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      locationManager.getCurrentLocation(provider, null, reactContext.mainExecutor) { location ->
        resolveLocation(location)
      }
      return
    }

    val listener = object : LocationListener {
      override fun onLocationChanged(location: Location) {
        locationManager.removeUpdates(this)
        resolveLocation(location)
      }

      override fun onProviderDisabled(disabledProvider: String) {
        locationManager.removeUpdates(this)
        if (resolved.compareAndSet(false, true)) {
          handler.removeCallbacks(timeoutRunnable)
          promise.reject("LOCATION_DISABLED", "GPS is disabled or location is unavailable.")
        }
      }
    }

    try {
      locationManager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper())
      val lastKnownLocation = locationManager.getLastKnownLocation(provider)
      if (lastKnownLocation != null) {
        resolveLocation(lastKnownLocation)
      }
    } catch (error: Throwable) {
      locationManager.removeUpdates(listener)
      if (resolved.compareAndSet(false, true)) {
        handler.removeCallbacks(timeoutRunnable)
        promise.reject("LOCATION_UNAVAILABLE", error.message ?: "Unable to fetch device location.")
      }
    }
  }
}
