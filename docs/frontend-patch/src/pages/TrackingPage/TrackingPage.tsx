import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  ParcelStatusTimeline,
  ETADisplay,
  LiveMap,
  NotificationBanner,
} from '../../components';
import { trackingService } from '../../services';
import { ParcelTracking, Notification } from '../../types';
import './TrackingPage.css';

export const TrackingPage: React.FC = () => {
  const { trackingId } = useParams<{ trackingId: string }>();
  const [searchParams] = useSearchParams();
  const [tracking, setTracking] = useState<ParcelTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  // Track previous state for comparison
  const prevTrackingRef = useRef<ParcelTracking | null>(null);

  // Check if live tracking should be shown (from URL param or tracking data)
  const showLiveMap = searchParams.get('live') === 'true';

  const addNotification = useCallback((notification: Notification) => {
    setNotifications((prev) => {
      // Prevent duplicate notifications
      if (prev.some(n => n.message === notification.message)) {
        return prev;
      }
      return [notification, ...prev];
    });
    // Auto-dismiss after 10 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
    }, 10000);
  }, []);

  const handleTrackingUpdate = useCallback((data: ParcelTracking) => {
    const prevData = prevTrackingRef.current;
    
    // Detect significant changes and show notifications
    if (prevData) {
      // BLE-driven notifications
      try {
        const prevBle = prevData.ble;
        const curBle = data.ble;
        if (curBle) {
          // low battery
          if ((curBle.battery ?? 100) <= 15 && (!prevBle || (prevBle.battery ?? 100) > 15)) {
            addNotification({
              id: `battery-${Date.now()}`,
              type: 'warning',
              message: `BLE device battery low (${curBle.battery}%)`,
              timestamp: new Date().toISOString()
            });
          }

          // shock event
          if ((curBle.sensors?.shock_g ?? 0) > 1.5 && (prevBle?.sensors?.shock_g ?? 0) <= 1.5) {
            addNotification({
              id: `shock-${Date.now()}`,
              type: 'warning',
              message: `Shock detected (g=${curBle.sensors?.shock_g})`,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        // ignore BLE notification errors
        console.warn('BLE notification error', e);
      }

      // Status change notification
      if (prevData.currentStatus !== data.currentStatus) {
        const statusMessages: Record<string, { message: string; type: 'info' | 'success' | 'warning' }> = {
          COLLECTED: { message: '📦 Your parcel has been collected!', type: 'info' },
          AT_LOCAL_DEPOT: { message: '🏢 Your parcel has arrived at the local depot', type: 'info' },
          LOADED_ON_VEHICLE: { message: '🚚 Your parcel is loaded onto the delivery vehicle!', type: 'info' },
          DELIVERY_STARTED: { message: '🛣️ Delivery run has started! Your parcel is on the way.', type: 'success' },
          DELIVERED: { message: '✅ Your parcel has been delivered!', type: 'success' },
        };
        
        const notification = statusMessages[data.currentStatus];
        if (notification) {
          addNotification({
            id: `status-${Date.now()}`,
            ...notification,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Deliveries before notification
      if (data.currentStatus === 'DELIVERY_STARTED' && prevData.deliveriesBeforeYours !== data.deliveriesBeforeYours) {
        if (data.deliveriesBeforeYours === 0 && prevData.deliveriesBeforeYours > 0) {
          addNotification({
            id: `next-${Date.now()}`,
            type: 'success',
            message: "🎯 You're next! The driver will arrive shortly.",
            timestamp: new Date().toISOString(),
          });
        } else if (data.deliveriesBeforeYours <= 2 && prevData.deliveriesBeforeYours > 2) {
          addNotification({
            id: `approaching-${Date.now()}`,
            type: 'info',
            message: `📍 Driver is approaching! Only ${data.deliveriesBeforeYours} delivery${data.deliveriesBeforeYours === 1 ? '' : 'ies'} before yours.`,
            timestamp: new Date().toISOString(),
          });
        }
      }
    }
    
    prevTrackingRef.current = data;
    setTracking(data);
  }, [addNotification]);

  const fetchTracking = useCallback(async () => {
    if (!trackingId) return;

    const response = await trackingService.getTracking(trackingId);
    if (response.success && response.data) {
      prevTrackingRef.current = response.data;
      setTracking(response.data);
      setError(null);
    } else {
      setError(response.error || 'Failed to fetch tracking information');
    }
    setLoading(false);
  }, [trackingId]);

  useEffect(() => {
    fetchTracking();

    // Subscribe to real-time updates via WebSocket
    if (trackingId) {
      const unsubscribe = trackingService.subscribeToUpdates(
        trackingId,
        (data) => {
          setIsConnected(true);
          handleTrackingUpdate(data);
        }
      );

      return () => {
        unsubscribe();
        setIsConnected(false);
      };
    }
  }, [trackingId, fetchTracking, handleTrackingUpdate]);

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  if (loading) {
    return (
      <div className="tracking-page">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading tracking information...</p>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="tracking-page">
        <div className="error-container">
          <h2>Unable to Find Tracking Information</h2>
          <p>{error || 'Please check your tracking number and try again.'}</p>
          <a href="/" className="back-link">Search for another parcel</a>
        </div>
      </div>
    );
  }

  return (
    <div className="tracking-page">
      <header className="tracking-header">
        <div className="header-content">
          <h1 className="page-title">Track Your Parcel</h1>
          <div className="tracking-id">
            <span className="tracking-label">Tracking ID:</span>
            <span className="tracking-number">{tracking.trackingId}</span>
            {tracking.ble && (
              <span className="ble-battery" title={`BLE battery: ${tracking.ble.battery ?? 'N/A'}%`}>
                🔋 {tracking.ble.battery ?? 'N/A'}%
              </span>
            )}
            {isConnected && (
              <span className="live-indicator" title="Live updates enabled">
                <span className="live-dot"></span>
                LIVE
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="tracking-content">
        {notifications.map((notification) => (
          <NotificationBanner
            key={notification.id}
            notification={notification}
            onDismiss={() => dismissNotification(notification.id)}
          />
        ))}

        <div className="delivery-info-card">
          <h2>Delivery Details</h2>
          <div className="delivery-details">
            <div className="detail-row">
              <span className="detail-label">Recipient</span>
              <span className="detail-value">{tracking.recipientName}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Address</span>
              <span className="detail-value">{tracking.deliveryAddress}</span>
            </div>
            {tracking.route.driverName && tracking.currentStatus === 'DELIVERY_STARTED' && (
              <div className="detail-row">
                <span className="detail-label">Driver</span>
                <span className="detail-value">{tracking.route.driverName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="tracking-grid">
          <div className="tracking-column status-column">
            <ParcelStatusTimeline statuses={tracking.statuses} />
          </div>

          <div className="tracking-column eta-column">
            <ETADisplay
              estimatedDelivery={tracking.estimatedDelivery}
              deliveriesBeforeYours={tracking.deliveriesBeforeYours}
            />
          </div>
        </div>

        {(showLiveMap || tracking.showLiveTracking) && tracking.vehicleLocation && tracking.currentStatus === 'DELIVERY_STARTED' && (
          <div className="live-map-section">
            <LiveMap
              vehicleLocation={tracking.vehicleLocation}
              deliveryAddress={tracking.deliveryAddress}
              destinationCoords={tracking.destinationCoords}
              driverName={tracking.route.driverName}
              routeStops={tracking.route.stops}
              currentStopIndex={tracking.route.currentStopIndex}
              trafficInfo={tracking.trafficInfo}
              activeIncidents={tracking.activeIncidents}
            />
          </div>
        )}

        <div className="route-info-card">
          <h3>Delivery Route Information</h3>
          <div className="route-stats">
            <div className="stat-item">
              <span className="stat-value">{tracking.route.completedStops}</span>
              <span className="stat-label">Deliveries Completed</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{tracking.route.totalStops - tracking.route.completedStops}</span>
              <span className="stat-label">Deliveries Remaining</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{tracking.route.totalStops}</span>
              <span className="stat-label">Total Stops</span>
            </div>
          </div>
        </div>
      </main>

      <footer className="tracking-footer">
        <p>
          Having trouble? <a href="/support">Contact Support</a>
        </p>
      </footer>
    </div>
  );
};

export default TrackingPage;

