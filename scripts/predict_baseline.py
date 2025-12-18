#!/usr/bin/env python3
"""
Baseline Model Prediction Script

Loads the production baseline model and makes predictions on new data.
Called by the API endpoint to get real-time predictions.

Usage:
    python3 scripts/predict_baseline.py '{"epsSurprise": 5.0, "surpriseMagnitude": 5.0, ...}'

Returns:
    {"prediction": 1, "confidence": 0.67, "recommendation": "BUY"}
"""

import pickle
import json
import sys
import numpy as np
from pathlib import Path

# Model paths
MODEL_DIR = Path(__file__).parent.parent / 'models'
MODEL_PATH = MODEL_DIR / 'baseline_model.pkl'
SCALER_PATH = MODEL_DIR / 'baseline_scaler.pkl'
FEATURES_PATH = MODEL_DIR / 'baseline_features.json'

# Feature order (must match training)
REQUIRED_FEATURES = [
    'epsSurprise',
    'surpriseMagnitude',
    'epsBeat',
    'epsMiss',
    'largeBeat',
    'largeMiss'
]

def load_model():
    """Load trained model and scaler"""
    try:
        with open(MODEL_PATH, 'rb') as f:
            model = pickle.load(f)
        with open(SCALER_PATH, 'rb') as f:
            scaler = pickle.load(f)
        return model, scaler
    except FileNotFoundError as e:
        print(json.dumps({
            'error': f'Model files not found: {e}',
            'model_path': str(MODEL_PATH),
            'scaler_path': str(SCALER_PATH)
        }), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'error': f'Failed to load model: {e}'
        }), file=sys.stderr)
        sys.exit(1)

def validate_features(features):
    """Validate that all required features are present"""
    missing = [f for f in REQUIRED_FEATURES if f not in features]
    if missing:
        print(json.dumps({
            'error': f'Missing required features: {missing}',
            'required': REQUIRED_FEATURES,
            'provided': list(features.keys())
        }), file=sys.stderr)
        sys.exit(1)

    # Convert boolean features to int if needed
    for key in ['epsBeat', 'epsMiss', 'largeBeat', 'largeMiss']:
        if isinstance(features[key], bool):
            features[key] = int(features[key])

    return features

def get_recommendation(confidence):
    """Get trading recommendation based on confidence"""
    if confidence >= 0.65:
        return {
            'action': 'BUY',
            'size': 'FULL',
            'reason': 'High confidence bullish signal'
        }
    elif confidence >= 0.55:
        return {
            'action': 'BUY',
            'size': 'HALF',
            'reason': 'Moderate confidence bullish signal'
        }
    elif confidence <= 0.35:
        return {
            'action': 'SHORT',
            'size': 'HALF',
            'reason': 'Low confidence suggests bearish outcome'
        }
    elif confidence <= 0.45:
        return {
            'action': 'HOLD',
            'size': 'SMALL',
            'reason': 'Low confidence, small position or skip'
        }
    else:
        return {
            'action': 'HOLD',
            'size': 'SMALL',
            'reason': 'Neutral confidence'
        }

def predict(features):
    """Make prediction on new features"""
    # Load model
    model, scaler = load_model()

    # Validate and prepare features
    features = validate_features(features)

    # Create feature vector in correct order
    X = np.array([[
        features['epsSurprise'],
        features['surpriseMagnitude'],
        features['epsBeat'],
        features['epsMiss'],
        features['largeBeat'],
        features['largeMiss']
    ]])

    # Scale features
    X_scaled = scaler.transform(X)

    # Make prediction
    prediction = int(model.predict(X_scaled)[0])
    confidence = float(model.predict_proba(X_scaled)[0, 1])

    # Get recommendation
    recommendation = get_recommendation(confidence)

    # Return result
    result = {
        'prediction': prediction,  # 0 = negative return, 1 = positive return
        'confidence': round(confidence, 3),
        'recommendation': recommendation,
        'features_used': features
    }

    return result

def main():
    """Main entry point"""
    if len(sys.argv) < 2:
        print(json.dumps({
            'error': 'Usage: python3 predict_baseline.py \'{"epsSurprise": 5.0, ...}\'',
            'required_features': REQUIRED_FEATURES
        }), file=sys.stderr)
        sys.exit(1)

    # Parse input features
    try:
        features_json = sys.argv[1]
        features = json.loads(features_json)
    except json.JSONDecodeError as e:
        print(json.dumps({
            'error': f'Invalid JSON input: {e}'
        }), file=sys.stderr)
        sys.exit(1)

    # Make prediction
    result = predict(features)

    # Output result as JSON
    print(json.dumps(result))

if __name__ == '__main__':
    main()
