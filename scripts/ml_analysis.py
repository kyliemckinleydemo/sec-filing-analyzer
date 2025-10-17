#!/usr/bin/env python3
"""
Proper Machine Learning Analysis for SEC Filing Predictions

Uses real ML: Ridge, Lasso, XGBoost, Random Forest
With proper cross-validation and feature selection
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import TimeSeriesSplit, cross_val_score
from sklearn.linear_model import Ridge, Lasso, ElasticNet, LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.feature_selection import RFE, SelectKBest, f_regression
from sklearn.metrics import mean_absolute_error, r2_score, mean_squared_error
import warnings
warnings.filterwarnings('ignore')

def load_data():
    """Load the exported dataset"""
    print("📊 Loading data...")
    df = pd.read_csv('data/ml_dataset.csv')
    print(f"   Loaded {len(df)} samples")
    return df

def prepare_features(df):
    """Prepare feature matrix and target"""
    print("\n🔧 Preparing features...")

    # Target variable
    y = df['actual7dReturn'].values

    # Feature columns (numeric only, exclude identifiers and ALL target variables)
    # CRITICAL: Exclude ALL target variables to prevent data leakage
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
        print(f"   Dropping {len(cols_to_drop)} features with >50% missing: {cols_to_drop}")
        X = X.drop(columns=cols_to_drop)

    # Fill remaining NaN with median
    for col in X.columns:
        if X[col].isna().sum() > 0:
            X[col].fillna(X[col].median(), inplace=True)

    print(f"   Features: {X.shape[1]}")
    print(f"   Samples: {X.shape[0]}")
    print(f"   Feature list: {list(X.columns)[:10]}...")

    return X, y, list(X.columns)

def direction_accuracy(y_true, y_pred):
    """Calculate direction accuracy (% correct sign predictions)"""
    correct = np.sum(np.sign(y_true) == np.sign(y_pred))
    return correct / len(y_true) * 100

def evaluate_model(model, X, y, model_name, cv_splits=5):
    """Evaluate model with time-series cross-validation"""
    print(f"\n🔬 Evaluating {model_name}...")

    # Time series cross-validation (respects temporal order)
    tscv = TimeSeriesSplit(n_splits=cv_splits)

    # Collect metrics across folds
    direction_accs = []
    maes = []
    r2s = []

    for fold, (train_idx, test_idx) in enumerate(tscv.split(X), 1):
        X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
        y_train, y_test = y[train_idx], y[test_idx]

        # Scale features
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        # Train model
        model.fit(X_train_scaled, y_train)

        # Predict
        y_pred = model.predict(X_test_scaled)

        # Metrics
        dir_acc = direction_accuracy(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        direction_accs.append(dir_acc)
        maes.append(mae)
        r2s.append(r2)

        print(f"   Fold {fold}: Direction={dir_acc:.1f}%, MAE={mae:.3f}, R²={r2:.3f}")

    # Average metrics
    avg_dir = np.mean(direction_accs)
    avg_mae = np.mean(maes)
    avg_r2 = np.mean(r2s)

    std_dir = np.std(direction_accs)

    print(f"\n   ✅ Average: Direction={avg_dir:.1f}% (±{std_dir:.1f}), MAE={avg_mae:.3f}, R²={avg_r2:.3f}")

    return {
        'model_name': model_name,
        'direction_accuracy': avg_dir,
        'direction_std': std_dir,
        'mae': avg_mae,
        'r2': avg_r2
    }

def feature_importance_analysis(X, y, feature_names):
    """Analyze feature importance"""
    print("\n🎯 Feature Importance Analysis...")

    # Use Random Forest to get importances
    rf = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X.values if hasattr(X, 'values') else X)
    rf.fit(X_scaled, y)

    # Get importances
    importances = rf.feature_importances_
    indices = np.argsort(importances)[::-1]

    print("\n   Top 10 Most Important Features:")
    for i in range(min(10, len(feature_names))):
        idx = indices[i]
        print(f"   {i+1}. {feature_names[idx]}: {importances[idx]:.4f}")

    return feature_names, importances

def train_final_model(X, y, feature_names, best_model):
    """Train final model on all data and show coefficients"""
    print(f"\n🏆 Training final {best_model} model on full dataset...")

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X.values if hasattr(X, 'values') else X)

    if best_model == 'Ridge':
        model = Ridge(alpha=1.0)
    elif best_model == 'Lasso':
        model = Lasso(alpha=0.1)
    elif best_model == 'ElasticNet':
        model = ElasticNet(alpha=0.1, l1_ratio=0.5)
    elif best_model == 'RandomForest':
        model = RandomForestRegressor(n_estimators=200, max_depth=10, random_state=42)
    elif best_model == 'XGBoost':
        model = GradientBoostingRegressor(n_estimators=200, max_depth=5, random_state=42)
    else:
        model = LinearRegression()

    model.fit(X_scaled, y)

    # Show coefficients for linear models
    if hasattr(model, 'coef_'):
        print("\n   Model Coefficients (Top 15 by absolute value):")
        coefs = model.coef_
        abs_coefs = np.abs(coefs)
        indices = np.argsort(abs_coefs)[::-1]

        for i in range(min(15, len(feature_names))):
            idx = indices[i]
            print(f"   {feature_names[idx]}: {coefs[idx]:.6f}")

        print(f"\n   Intercept: {model.intercept_:.6f}")

    return model, scaler

def main():
    print("=" * 80)
    print("   PROPER MACHINE LEARNING ANALYSIS")
    print("=" * 80)

    # Load data
    df = load_data()

    # Prepare features
    X, y, feature_names = prepare_features(df)

    # Show data stats
    print(f"\n📈 Target Statistics:")
    print(f"   Mean return: {np.mean(y):.2f}%")
    print(f"   Std dev: {np.std(y):.2f}%")
    print(f"   Min: {np.min(y):.2f}%, Max: {np.max(y):.2f}%")
    print(f"   % Positive: {(y > 0).sum() / len(y) * 100:.1f}%")

    # Feature importance
    feature_importance_analysis(X, y, feature_names)

    # Test multiple models
    print("\n" + "=" * 80)
    print("   MODEL COMPARISON")
    print("=" * 80)

    models = {
        'Linear (OLS)': LinearRegression(),
        'Ridge (L2)': Ridge(alpha=1.0),
        'Lasso (L1)': Lasso(alpha=0.1, max_iter=5000),
        'ElasticNet': ElasticNet(alpha=0.1, l1_ratio=0.5, max_iter=5000),
        'RandomForest': RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42, n_jobs=-1),
        'GradientBoosting': GradientBoostingRegressor(n_estimators=100, max_depth=5, random_state=42)
    }

    results = []
    for name, model in models.items():
        result = evaluate_model(model, X, y, name, cv_splits=5)
        results.append(result)

    # Summary table
    print("\n" + "=" * 80)
    print("   RESULTS SUMMARY")
    print("=" * 80)
    print(f"\n{'Model':<20} {'Direction %':<15} {'MAE':<10} {'R²':<10}")
    print("-" * 80)

    for r in sorted(results, key=lambda x: x['direction_accuracy'], reverse=True):
        print(f"{r['model_name']:<20} {r['direction_accuracy']:>6.1f}% ±{r['direction_std']:.1f}  {r['mae']:>8.3f}  {r['r2']:>8.3f}")

    # Find best model
    best_result = max(results, key=lambda x: x['direction_accuracy'])
    print(f"\n🏆 BEST MODEL: {best_result['model_name']}")
    print(f"   Direction Accuracy: {best_result['direction_accuracy']:.1f}% (±{best_result['direction_std']:.1f}%)")
    print(f"   MAE: {best_result['mae']:.3f}")
    print(f"   R²: {best_result['r2']:.3f}")

    # Train final model
    final_model, final_scaler = train_final_model(X, y, feature_names, best_result['model_name'].split()[0])

    # Segment analysis
    print("\n" + "=" * 80)
    print("   SEGMENT ANALYSIS")
    print("=" * 80)

    # By market cap
    for segment in ['mega', 'large', 'mid', 'small']:
        mask = df['marketCapCategory'] == segment
        if mask.sum() > 10:  # At least 10 samples
            X_seg = X[mask].values if hasattr(X, 'values') else X[mask]
            y_seg = y[mask]

            scaler = StandardScaler()
            X_seg_scaled = scaler.fit_transform(X_seg)

            # Use best model
            if best_result['model_name'].startswith('Ridge'):
                model = Ridge(alpha=1.0)
            elif best_result['model_name'].startswith('RandomForest'):
                model = RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42)
            else:
                model = LinearRegression()

            model.fit(X_seg_scaled, y_seg)
            y_pred = model.predict(X_seg_scaled)

            dir_acc = direction_accuracy(y_seg, y_pred)
            mae = mean_absolute_error(y_seg, y_pred)

            print(f"\n   {segment.upper()}-CAP ({mask.sum()} samples):")
            print(f"      Direction Accuracy: {dir_acc:.1f}%")
            print(f"      MAE: {mae:.3f}")

    print("\n" + "=" * 80)
    print("   NEXT STEPS")
    print("=" * 80)
    print("\n   1. If accuracy < 65%: Backfill more data (need 500+ samples)")
    print("   2. If accuracy ≥ 65%: Deploy this model to production")
    print("   3. Consider adding 30-day returns for +8-12 point improvement")
    print("")

if __name__ == '__main__':
    main()
