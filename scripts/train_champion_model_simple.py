#!/usr/bin/env python3
"""Train champion model with concernLevel"""
import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score
import pickle
import os

def direction_accuracy(y_true, y_pred):
    correct = np.sum(np.sign(y_true) == np.sign(y_pred))
    return correct / len(y_true) * 100

# Load data
df = pd.read_csv('data/ml_dataset_with_concern.csv')

# Target
y = df['actual7dReturn'].values

# Features (EXCLUDE riskScore+sentimentScore, USE concernLevel)
exclude_cols = ['filingId', 'ticker', 'companyName', 'filingDate',
                'actual7dReturn', 'actual30dReturn', 'actual7dAlpha', 'actual30dAlpha',
                'marketCapCategory', 'riskScore', 'sentimentScore']  # EXCLUDE legacy

feature_cols = [col for col in df.columns if col not in exclude_cols]
X = df[feature_cols].copy()

# Handle categorical
X['is_10K'] = (df['filingType'] == '10-K').astype(int)
X['is_10Q'] = (df['filingType'] == '10-Q').astype(int)
X = X.drop('filingType', axis=1)

# Drop high-missing features
missing_pct = X.isnull().sum() / len(X)
X = X.drop(columns=missing_pct[missing_pct > 0.5].index.tolist())

# Fill NaN
for col in X.columns:
    if X[col].isna().sum() > 0:
        X[col].fillna(X[col].median(), inplace=True)

# Cross-validation
tscv = TimeSeriesSplit(n_splits=5)
direction_accs = []
maes = []
r2s = []

for train_idx, test_idx in tscv.split(X):
    X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
    y_train, y_test = y[train_idx], y[test_idx]

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
    model.fit(X_train_scaled, y_train)
    y_pred = model.predict(X_test_scaled)

    direction_accs.append(direction_accuracy(y_test, y_pred))
    maes.append(mean_absolute_error(y_test, y_pred))
    r2s.append(r2_score(y_test, y_pred))

# Results
avg_dir = np.mean(direction_accs)
std_dir = np.std(direction_accs)
avg_mae = np.mean(maes)
avg_r2 = np.mean(r2s)

# Save results
os.makedirs('models', exist_ok=True)
with open('models/champion_results.txt', 'w') as f:
    f.write(f"{avg_dir}\n")
    f.write(f"{std_dir}\n")
    f.write(f"{avg_mae}\n")
    f.write(f"{avg_r2}\n")

print(f"CHAMPION MODEL (concernLevel)")
print(f"Direction Accuracy: {avg_dir:.1f}% (±{std_dir:.1f})")
print(f"MAE: {avg_mae:.3f}")
print(f"R²: {avg_r2:.3f}")
