#!/usr/bin/env python3
"""
Generate ML prediction for a single filing

Loads the trained RandomForest model and generates a prediction
for a single filing based on its features.
"""

import sys
import json
import pandas as pd
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler
import warnings
warnings.filterwarnings('ignore')

def load_trained_model():
    """Load the trained model from the dataset"""
    # Load full dataset to retrain model
    df = pd.read_csv('data/ml_dataset.csv')

    # Target variable
    y = df['actual7dReturn'].values

    # Feature columns (numeric only, exclude identifiers and ALL target variables)
    exclude_cols = ['filingId', 'ticker', 'companyName', 'filingDate',
                    'actual7dReturn', 'actual30dReturn', 'actual7dAlpha', 'actual30dAlpha',
                    'marketCapCategory']

    # Get numeric features
    feature_cols = [col for col in df.columns if col not in exclude_cols]

    # Create feature matrix
    X = df[feature_cols].copy()

    # Handle categorical filingType
    X['is_10K'] = (df['filingType'] == '10-K').astype(int)
    X['is_10Q'] = (df['filingType'] == '10-Q').astype(int)
    X = X.drop('filingType', axis=1)

    # Drop features with >50% missing
    missing_pct = X.isnull().sum() / len(X)
    cols_to_drop = missing_pct[missing_pct > 0.5].index.tolist()
    if cols_to_drop:
        X = X.drop(columns=cols_to_drop)

    # Fill remaining NaN with median
    for col in X.columns:
        if X[col].isna().sum() > 0:
            X[col].fillna(X[col].median(), inplace=True)

    # Train model
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X.values if hasattr(X, 'values') else X)

    model = RandomForestRegressor(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1)
    model.fit(X_scaled, y)

    feature_names = list(X.columns)

    return model, scaler, feature_names

def predict_filing(filing_data, model, scaler, feature_names):
    """Generate prediction for a single filing"""

    # Create feature vector in the same order as training
    features = {}

    # Handle filingType -> binary encoding
    is_10K = 1 if filing_data.get('filingType') == '10-K' else 0
    is_10Q = 1 if filing_data.get('filingType') == '10-Q' else 0

    # Build feature dict (exclude filingType as it's converted to is_10K/is_10Q)
    for key in filing_data:
        if key not in ['filingId', 'ticker', 'companyName', 'filingDate', 'filingType',
                       'actual7dReturn', 'actual30dReturn', 'actual7dAlpha', 'actual30dAlpha',
                       'marketCapCategory']:
            features[key] = filing_data[key]

    # Add binary encoded filing type
    features['is_10K'] = is_10K
    features['is_10Q'] = is_10Q

    # Create DataFrame with features in correct order
    X_new = pd.DataFrame([features])

    # Ensure all required features are present (fill missing with 0)
    for feature in feature_names:
        if feature not in X_new.columns:
            X_new[feature] = 0.0

    # Reorder to match training
    X_new = X_new[feature_names]

    # Fill any NaN with 0
    X_new = X_new.fillna(0)

    # Scale
    X_scaled = scaler.transform(X_new)

    # Predict
    prediction = model.predict(X_scaled)[0]

    # Calculate confidence based on feature values
    # Higher analyst activity + better fundamentals = higher confidence
    net_upgrades = filing_data.get('netUpgrades', 0)
    analyst_coverage = filing_data.get('analystCoverage', 0)
    analyst_upsideOk = filing_data.get('analystUpsidePotential', 0) > 5

    # Base confidence: 65%
    confidence = 0.65

    # Boost for strong analyst signals
    if net_upgrades >= 2:
        confidence += 0.10
    elif net_upgrades >= 1:
        confidence += 0.05

    if analyst_coverage >= 10 and analyst_upsideOk:
        confidence += 0.08
    elif analyst_coverage >= 5:
        confidence += 0.04

    # Boost for large predicted movements
    if abs(prediction) >= 5:
        confidence += 0.10
    elif abs(prediction) >= 3:
        confidence += 0.05

    # Cap at 95%
    confidence = min(confidence, 0.95)

    return {
        'predicted7dReturn': float(prediction),
        'predictionConfidence': float(confidence)
    }

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'No filing data provided',
            'usage': 'python3 predict_single_filing.py \'{"ticker": "AAPL", ...}\''
        }))
        sys.exit(1)

    try:
        # Parse input JSON
        filing_json = sys.argv[1]
        filing_data = json.loads(filing_json)

        # Load model
        model, scaler, feature_names = load_trained_model()

        # Generate prediction
        result = predict_filing(filing_data, model, scaler, feature_names)

        # Output as JSON
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({
            'error': str(e)
        }))
        sys.exit(1)

if __name__ == '__main__':
    main()
