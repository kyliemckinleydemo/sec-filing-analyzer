'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

interface Alert {
  id: string;
  alertType: string;
  ticker?: string;
  sector?: string;
  enabled: boolean;
  frequency: string;
  deliveryTime: string;
  minConcernLevel?: number;
  minPredictedReturn?: number;
  createdAt: string;
}

const ALERT_TYPES = [
  { value: 'new_filing', label: 'New Filing', description: 'Notify when tracked companies file new reports' },
  { value: 'prediction_result', label: 'Prediction Result', description: 'Notify when predictions are available for new filings' },
  { value: 'analyst_change', label: 'Analyst Activity', description: 'Notify on upgrades, downgrades, or target changes' },
  { value: 'sector_filing', label: 'Sector Filing', description: 'Notify for filings in watched sectors' },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newAlertType, setNewAlertType] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    try {
      const response = await fetch('/api/alerts');

      if (response.status === 401) {
        router.push('/');
        return;
      }

      const data = await response.json();
      setAlerts(data.alerts || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddAlert = async () => {
    if (!newAlertType) return;

    setAdding(true);
    try {
      const response = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertType: newAlertType,
          enabled: true,
          frequency: 'immediate',
        }),
      });

      if (response.ok) {
        setNewAlertType('');
        await fetchAlerts();
      }
    } catch (error) {
      console.error('Error adding alert:', error);
    } finally {
      setAdding(false);
    }
  };

  const handleToggleAlert = async (alert: Alert) => {
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: alert.id,
          enabled: !alert.enabled,
        }),
      });
      await fetchAlerts();
    } catch (error) {
      console.error('Error updating alert:', error);
    }
  };

  const handleUpdateFrequency = async (alert: Alert, frequency: string) => {
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: alert.id,
          frequency,
        }),
      });
      await fetchAlerts();
    } catch (error) {
      console.error('Error updating alert:', error);
    }
  };

  const handleUpdateDeliveryTime = async (alert: Alert, deliveryTime: string) => {
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: alert.id,
          deliveryTime,
        }),
      });
      await fetchAlerts();
    } catch (error) {
      console.error('Error updating alert:', error);
    }
  };

  const handleUpdateThreshold = async (alert: Alert, field: string, value: number | null) => {
    try {
      await fetch('/api/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: alert.id,
          [field]: value,
        }),
      });
      await fetchAlerts();
    } catch (error) {
      console.error('Error updating alert:', error);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      await fetch(`/api/alerts?id=${id}`, {
        method: 'DELETE',
      });
      await fetchAlerts();
    } catch (error) {
      console.error('Error deleting alert:', error);
    }
  };

  const getAlertTypeLabel = (type: string) => {
    return ALERT_TYPES.find(t => t.value === type)?.label || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="container mx-auto px-4 py-8">
        <Button
          variant="outline"
          onClick={() => router.push('/profile')}
          className="mb-6"
        >
          ← Back to Profile
        </Button>

        <h1 className="text-4xl font-bold mb-2">Alert Preferences</h1>
        <p className="text-slate-600 mb-8">
          Configure how and when you receive notifications about your watchlist.
        </p>

        {/* Alert Types Overview */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Available Alert Types</CardTitle>
            <CardDescription>
              Choose which events you want to be notified about
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ALERT_TYPES.map((type) => (
              <div key={type.value} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <h3 className="font-medium">{type.label}</h3>
                  <p className="text-sm text-slate-600">{type.description}</p>
                </div>
                <Button
                  onClick={() => {
                    setNewAlertType(type.value);
                    handleAddAlert();
                  }}
                  disabled={adding || alerts.some(a => a.alertType === type.value)}
                  size="sm"
                >
                  {alerts.some(a => a.alertType === type.value) ? 'Added' : 'Add'}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Active Alerts */}
        <Card>
          <CardHeader>
            <CardTitle>Active Alerts ({alerts.filter(a => a.enabled).length})</CardTitle>
            <CardDescription>
              Manage your notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <p className="text-slate-500 text-center py-8">
                No alerts configured yet. Add an alert type above to get started.
              </p>
            ) : (
              <div className="space-y-6">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-6 border rounded-lg ${alert.enabled ? 'bg-white' : 'bg-slate-50'}`}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="font-bold text-lg text-slate-900">{getAlertTypeLabel(alert.alertType)}</h3>
                        {alert.enabled ? (
                          <Badge className="bg-green-100 text-green-700">Enabled</Badge>
                        ) : (
                          <Badge variant="outline">Disabled</Badge>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleAlert(alert)}
                        >
                          {alert.enabled ? 'Disable' : 'Enable'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteAlert(alert.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          Delete
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {/* Frequency */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Notification Frequency
                        </label>
                        <Select
                          value={alert.frequency}
                          onValueChange={(value) => handleUpdateFrequency(alert, value)}
                          disabled={!alert.enabled}
                        >
                          <SelectTrigger className="max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="immediate">Immediate (as they happen)</SelectItem>
                            <SelectItem value="daily_digest">Daily Digest (once per day)</SelectItem>
                            <SelectItem value="weekly_digest">Weekly Digest (once per week)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Delivery Time */}
                      <div>
                        <label className="text-sm font-medium text-slate-700 mb-2 block">
                          Delivery Time
                        </label>
                        <Select
                          value={alert.deliveryTime}
                          onValueChange={(value) => handleUpdateDeliveryTime(alert, value)}
                          disabled={!alert.enabled}
                        >
                          <SelectTrigger className="max-w-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="both">Both Morning & Evening (Default)</SelectItem>
                            <SelectItem value="morning">Morning Only (8:00am ET)</SelectItem>
                            <SelectItem value="evening">Evening Only (6:00pm ET)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-slate-500 mt-1">
                          Choose when you want to receive daily alert emails
                        </p>
                      </div>

                      {/* Thresholds */}
                      {(alert.alertType === 'new_filing' || alert.alertType === 'prediction_result') && (
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-slate-700 mb-2 block">
                              Min. Concern Level (0-10)
                            </label>
                            <Input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              placeholder="Any level"
                              value={alert.minConcernLevel || ''}
                              onChange={(e) => handleUpdateThreshold(
                                alert,
                                'minConcernLevel',
                                e.target.value ? parseFloat(e.target.value) : null
                              )}
                              disabled={!alert.enabled}
                            />
                            <p className="text-xs text-slate-500 mt-1">
                              Only notify if concern level is this high or higher
                            </p>
                          </div>

                          {alert.alertType === 'prediction_result' && (
                            <div>
                              <label className="text-sm font-medium text-slate-700 mb-2 block">
                                Min. Predicted Return (%)
                              </label>
                              <Input
                                type="number"
                                step="0.1"
                                placeholder="Any return"
                                value={alert.minPredictedReturn || ''}
                                onChange={(e) => handleUpdateThreshold(
                                  alert,
                                  'minPredictedReturn',
                                  e.target.value ? parseFloat(e.target.value) : null
                                )}
                                disabled={!alert.enabled}
                              />
                              <p className="text-xs text-slate-500 mt-1">
                                Only notify if predicted return meets this threshold
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6 bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-700">
              <strong>Note:</strong> Alerts are sent to your email address. Make sure to check your spam folder if you don't see them.
              You must have at least one stock or sector in your watchlist to receive alerts.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
