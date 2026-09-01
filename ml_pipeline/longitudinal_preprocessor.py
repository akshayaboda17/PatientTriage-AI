"""
Longitudinal Clinical Preprocessor for PatientTriage.ai (Task 3).
Fits scalers and transforms 48-dimensional longitudinal trajectory feature matrices.
"""
import joblib
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional
from sklearn.preprocessing import StandardScaler

from ml_pipeline.longitudinal_schema import (
    LONGITUDINAL_FEATURE_COLUMNS,
    LONGITUDINAL_NUMERICAL_COLUMNS,
    LONGITUDINAL_CATEGORICAL_BINARY_COLUMNS
)

class LongitudinalPreprocessor:
    def __init__(self):
        self.feature_columns = LONGITUDINAL_FEATURE_COLUMNS
        self.numerical_columns = LONGITUDINAL_NUMERICAL_COLUMNS
        self.categorical_columns = LONGITUDINAL_CATEGORICAL_BINARY_COLUMNS
        self.scaler = StandardScaler()
        self.is_fitted = False

    def fit(self, df: pd.DataFrame) -> "LongitudinalPreprocessor":
        # Extract numerical subset
        num_df = df[self.numerical_columns].copy().fillna(0.0)
        self.scaler.fit(num_df)
        self.is_fitted = True
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        if not self.is_fitted:
            raise RuntimeError("LongitudinalPreprocessor must be fitted before calling transform().")

        # Fill missing values safely
        df_clean = df.copy()
        for col in self.feature_columns:
            if col not in df_clean.columns:
                df_clean[col] = 0.0
            else:
                df_clean[col] = df_clean[col].fillna(0.0)

        num_scaled = self.scaler.transform(df_clean[self.numerical_columns])
        cat_vals = df_clean[self.categorical_columns].values.astype(float)

        # Assemble unified feature matrix maintaining exact column order
        ordered_parts = []
        for col in self.feature_columns:
            if col in self.numerical_columns:
                idx = self.numerical_columns.index(col)
                ordered_parts.append(num_scaled[:, idx:idx+1])
            else:
                idx = self.categorical_columns.index(col)
                ordered_parts.append(cat_vals[:, idx:idx+1])

        return np.hstack(ordered_parts)

    def fit_transform(self, df: pd.DataFrame) -> np.ndarray:
        return self.fit(df).transform(df)

    def save(self, filepath: str):
        joblib.dump(self, filepath)

    @classmethod
    def load(cls, filepath: str) -> "LongitudinalPreprocessor":
        return joblib.load(filepath)
