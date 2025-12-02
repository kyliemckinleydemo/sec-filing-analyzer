# Statistical Analysis Plan for Model Development

**Dataset**: 200-400+ mega-cap earnings reports (10-K/10-Q only, >$500B market cap)
**Target**: Predict 7-day stock return after filing
**Current Baseline**: 60.8% direction accuracy with linear model

---

## 1. EXPLORATORY DATA ANALYSIS (EDA)

### A. Univariate Analysis
- **Distribution of target variable** (7-day returns)
  - Histogram, Q-Q plot (check normality)
  - Identify outliers (>3 standard deviations)
  - Check for skewness/kurtosis

- **Feature distributions**
  - Box plots for each predictor
  - Identify missing data patterns
  - Check for extreme values

### B. Bivariate Analysis
- **Correlation matrix** (Pearson + Spearman)
  - Identify multicollinearity (VIF > 10)
  - Find highly correlated features (r > 0.8)
  - Scatter plots for top correlations

- **Feature importance ranking**
  - Univariate correlation with target
  - Information gain / mutual information
  - ANOVA F-statistic

### C. Multivariate Analysis
- **Principal Component Analysis (PCA)**
  - Reduce dimensionality
  - Identify hidden patterns
  - Visualize in 2D/3D space

- **Cluster analysis**
  - K-means on features (find market regimes)
  - Do different clusters have different return patterns?

---

## 2. FEATURE ENGINEERING

### A. Interaction Terms
```typescript
// Example interactions to test:
- sentimentScore × riskScore (optimism vs caution)
- peRatio × epsGrowth (valuation vs growth)
- currentPrice × volatility30 (price momentum × risk)
- marketCap × spxReturn7d (size vs market trend)
```

### B. Polynomial Features
```typescript
// Test non-linear relationships:
- sentimentScore²
- peRatio²
- rsi14² (RSI is bounded 0-100, may have U-shaped effect)
```

### C. Derived Features
```typescript
// Financial ratios and composite scores:
- EPS surprise: (epsActual - epsEstimateCurrentY) / |epsEstimateCurrentY|
- PE vs sector median
- Sentiment-Risk composite: sentimentScore - riskScore
- Momentum score: (rsi14 + macd + priceToMA30) / 3
```

### D. Categorical Encoding
```typescript
// One-hot encode:
- Filing type (10-K vs 10-Q)
- Quarter (Q1, Q2, Q3, Q4)
- Sector
- Market regime (bull/bear based on VIX/SPX)
```

---

## 3. MODEL SELECTION & COMPARISON

### A. Linear Models

**1. Ordinary Least Squares (OLS) - Baseline**
- Current 60.8% accuracy model
- Easy to interpret
- Test assumptions: linearity, homoscedasticity, normality of residuals

**2. Ridge Regression (L2 Regularization)**
- Handles multicollinearity better
- Prevents overfitting
- Cross-validate alpha parameter

**3. Lasso Regression (L1 Regularization)**
- Automatic feature selection (zeros out coefficients)
- Simpler model with fewer features
- Cross-validate alpha parameter

**4. Elastic Net (L1 + L2)**
- Best of both worlds
- Good when features are correlated
- Cross-validate alpha and L1 ratio

**5. Stepwise Regression**
- Forward selection: start with best feature, add more
- Backward elimination: start with all, remove worst
- Bidirectional: combine both approaches
- Use AIC/BIC for model selection

### B. Non-Linear Models

**6. Polynomial Regression**
- Add squared/cubic terms
- Test degrees 2-4
- Watch for overfitting

**7. Random Forest Regressor**
- Handles non-linear relationships automatically
- Feature importance scores
- Less interpretable but often more accurate
- Tune: n_estimators, max_depth, min_samples_split

**8. Gradient Boosting (XGBoost/LightGBM)**
- Often best performance
- Tune: learning_rate, max_depth, n_estimators
- Feature importance analysis
- SHAP values for interpretability

**9. Support Vector Regression (SVR)**
- Kernel trick for non-linearity
- Test kernels: RBF, polynomial
- Good with high-dimensional data

**10. Neural Network (Simple MLP)**
- 2-3 hidden layers
- Test architectures: [64,32], [128,64,32]
- Dropout for regularization
- Early stopping on validation set

### C. Ensemble Methods

**11. Stacking**
- Combine multiple models (linear + tree-based)
- Use cross-validation to train meta-model
- Often outperforms individual models

**12. Voting Regressor**
- Average predictions from multiple models
- Weighted by individual performance

---

## 4. MODEL VALIDATION STRATEGIES

### A. Train/Validation/Test Split
```
- Training: 60% (build model)
- Validation: 20% (tune hyperparameters)
- Test: 20% (final evaluation, never touch until end)

Important: Split by TIME (oldest→newest) not randomly
- Train on 2023-2024 data
- Validate on Q1-Q2 2025
- Test on Q3-Q4 2025
```

### B. Cross-Validation
**Time Series Cross-Validation (Walk-Forward)**
```
Fold 1: Train[1-100] → Test[101-120]
Fold 2: Train[1-120] → Test[121-140]
Fold 3: Train[1-140] → Test[141-160]
...
```
**Why**: Prevents look-ahead bias (can't use future to predict past)

### C. K-Fold Cross-Validation (for robustness check)
- 5-fold or 10-fold
- Use stratified folds if classes are imbalanced

---

## 5. HYPERPARAMETER OPTIMIZATION

### A. Grid Search
- Exhaustive search over parameter grid
- Good for small parameter spaces
- Example: alpha in [0.001, 0.01, 0.1, 1, 10]

### B. Random Search
- Sample random combinations
- More efficient than grid search
- Good for large parameter spaces

### C. Bayesian Optimization
- Smart search using probability
- Uses past evaluations to guide search
- Libraries: Optuna, Hyperopt

---

## 6. PERFORMANCE METRICS

### A. Regression Metrics
```typescript
1. Direction Accuracy: % correct up/down predictions (PRIMARY)
2. MAE (Mean Absolute Error): Average |predicted - actual|
3. RMSE (Root Mean Squared Error): Penalizes large errors
4. R² (R-squared): Variance explained by model
5. MAPE (Mean Absolute Percentage Error): % error
```

### B. Classification Metrics (Up/Down)
```typescript
6. Precision: When we predict UP, how often is it UP?
7. Recall: Of all UP movements, how many did we catch?
8. F1-Score: Harmonic mean of precision/recall
9. Confusion Matrix: TP, FP, TN, FN
10. ROC-AUC: Overall classification quality
```

### C. Financial Metrics
```typescript
11. Sharpe Ratio: (mean return - risk_free) / std_dev
12. Max Drawdown: Largest peak-to-trough decline
13. Win Rate: % profitable predictions
14. Profit Factor: Gross profit / Gross loss
15. Average Win vs Average Loss
```

---

## 7. STATISTICAL TESTS

### A. Model Comparison Tests
**1. Paired t-test**
- Compare two models on same data
- H0: Models have equal performance
- Use if residuals are normally distributed

**2. Wilcoxon Signed-Rank Test**
- Non-parametric alternative to t-test
- More robust to outliers

**3. Diebold-Mariano Test**
- Specifically for forecast comparison
- Tests if prediction errors differ significantly

### B. Assumption Testing
**1. Normality of Residuals**
- Shapiro-Wilk test
- Kolmogorov-Smirnov test
- Visual: Q-Q plot

**2. Homoscedasticity**
- Breusch-Pagan test
- White's test
- Visual: residuals vs fitted plot

**3. Autocorrelation**
- Durbin-Watson statistic
- Ljung-Box test
- ACF/PACF plots

**4. Multicollinearity**
- Variance Inflation Factor (VIF)
- VIF > 10 indicates problem

---

## 8. SEGMENTATION ANALYSIS

### A. By Filing Type
- Separate models for 10-K vs 10-Q?
- Do they have different patterns?

### B. By Market Condition
```typescript
Market regimes:
- Bull market (VIX < 15, SPX up)
- Normal (VIX 15-25)
- Bear/Crisis (VIX > 25, SPX down)
```

### C. By Quarter
- Q4 earnings different from Q1-Q3?
- Year-end effects?

### D. By Sector (if we expand beyond mega-caps)
- Tech vs Healthcare vs Finance
- Different sensitivities

---

## 9. FEATURE SELECTION METHODS

### A. Filter Methods (Fast)
```typescript
1. Correlation threshold (remove if |r| < 0.05)
2. Mutual information
3. Chi-squared test
4. ANOVA F-statistic
```

### B. Wrapper Methods (Accurate but Slow)
```typescript
1. Recursive Feature Elimination (RFE)
   - Start with all features
   - Remove least important iteratively

2. Forward Selection
   - Start with 0 features
   - Add best one at a time

3. Backward Elimination
   - Start with all features
   - Remove worst one at a time
```

### C. Embedded Methods
```typescript
1. Lasso (zeros out coefficients)
2. Ridge (shrinks coefficients)
3. Random Forest feature importances
4. XGBoost feature importances
```

---

## 10. ADVANCED TECHNIQUES

### A. Quantile Regression
- Don't just predict mean return
- Predict 10th, 50th, 90th percentiles
- Gives confidence intervals

### B. Robust Regression
- Less sensitive to outliers
- Huber regression, RANSAC
- Use if outliers distort results

### C. Weighted Regression
- Weight recent filings more heavily
- Account for market regime changes
- Time-decay weights

### D. Multi-Task Learning
- Predict multiple targets simultaneously
  - 7-day return
  - 30-day return
  - Volatility
- Shared representations help all tasks

### E. SHAP (SHapley Additive exPlanations)
- Explain any model's predictions
- Feature importance for each prediction
- Helps debug and trust model

---

## 11. RECOMMENDED ANALYSIS SEQUENCE

### Phase 1: Foundation (Week 1)
1. ✅ EDA: distributions, correlations, outliers
2. ✅ Baseline: OLS regression (60.8% benchmark)
3. ✅ Train/val/test split (time-based)

### Phase 2: Linear Models (Week 1-2)
4. Ridge, Lasso, Elastic Net
5. Stepwise regression (forward/backward/both)
6. Feature engineering (interactions, polynomials)
7. Compare via cross-validation

### Phase 3: Non-Linear Models (Week 2-3)
8. Random Forest
9. XGBoost/LightGBM
10. Neural Network (simple MLP)
11. Ensemble (stacking/voting)

### Phase 4: Optimization (Week 3-4)
12. Hyperparameter tuning (Bayesian optimization)
13. Feature selection (RFE, Lasso)
14. Model interpretability (SHAP values)

### Phase 5: Validation (Week 4)
15. Walk-forward validation
16. Statistical tests (Diebold-Mariano)
17. Financial metrics (Sharpe, max drawdown)
18. Final test set evaluation

### Phase 6: Deployment Decision
19. Compare all models
20. Choose best by: accuracy, simplicity, interpretability
21. Document assumptions and limitations
22. Set monitoring metrics

---

## 12. SUCCESS CRITERIA

### Minimum Viable Model
- **Direction Accuracy**: ≥ 60% (beat baseline)
- **MAE**: < 4.0% (reasonable error magnitude)
- **Sharpe Ratio**: > 1.0 (if trading)
- **Interpretability**: Explainable coefficients/features

### Stretch Goals
- **Direction Accuracy**: ≥ 65%
- **MAE**: < 3.0%
- **Sharpe Ratio**: > 1.5
- **Consistency**: < 5% std across CV folds

---

## 13. TOOLS & LIBRARIES

### Python Ecosystem
```python
# Data manipulation
import pandas as pd
import numpy as np

# Visualization
import matplotlib.pyplot as plt
import seaborn as sns

# Sklearn (linear models, cross-validation)
from sklearn.linear_model import Ridge, Lasso, ElasticNet
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import TimeSeriesSplit, GridSearchCV
from sklearn.metrics import mean_absolute_error, r2_score

# Advanced models
import xgboost as xgb
import lightgbm as lgb
from sklearn.neural_network import MLPRegressor

# Interpretability
import shap

# Statistical tests
from scipy import stats
from statsmodels.stats.diagnostic import het_breuschpagan
```

### TypeScript/Node.js (for our stack)
```typescript
// We can implement in TypeScript, but for complex ML:
// 1. Use Python for model development
// 2. Export model coefficients/parameters
// 3. Implement inference in TypeScript
// 4. Or call Python model via subprocess/API
```

---

## 14. EXPECTED OUTCOMES

### Best Case Scenario
- XGBoost or ensemble achieves **65-70% direction accuracy**
- Feature engineering reveals new predictive patterns
- SHAP analysis shows clear decision rules
- Deploy sophisticated model in production

### Realistic Scenario
- Regularized linear model (Ridge/Lasso) achieves **62-65% accuracy**
- Feature selection reduces complexity
- Easy to explain and deploy
- Incremental improvement over baseline

### Conservative Scenario
- Original linear model remains best at **60.8% accuracy**
- Non-linear models overfit on small dataset
- Keep simple, interpretable baseline
- Focus on data quality and filtering strategy

---

## BOTTOM LINE

**The goal isn't just maximum accuracy - it's finding a model that is:**
1. ✅ **Accurate** (>60% direction, profitable)
2. ✅ **Robust** (works across time periods and market conditions)
3. ✅ **Interpretable** (we understand why it works)
4. ✅ **Deployable** (fast inference, maintainable code)
5. ✅ **Honest** (clear about limitations, filters out low-confidence predictions)

We'll test many approaches, but the winning model might be simpler than the most complex one. **Trust the validation process.**
