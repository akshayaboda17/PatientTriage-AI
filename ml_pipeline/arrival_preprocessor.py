"""
Arrival Clinical Preprocessor for PatientTriage.ai.
Standardizes and prepares strict T0 feature matrices for multi-class triage models.
Fits scaler and imputer exclusively on training partition to prevent data leakage.
"""
import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
from sklearn.preprocessing import StandardScaler
from ml_pipeline.arrival_schema import (
    ARRIVAL_ALL_FEATURE_COLUMNS,
    ARRIVAL_NUMERICAL_FEATURE_COLUMNS,
    ARRIVAL_CATEGORICAL_BINARY_FEATURE_COLUMNS
)

class ArrivalClinicalPreprocessor:
    """
    Standardizes point-of-arrival (T0) feature matrices for multi-class triage modeling.
    """

    def __init__(self, scale_numerical: bool = False):
        self.scale_numerical = scale_numerical
        self.scaler = StandardScaler() if scale_numerical else None
        self.feature_columns = ARRIVAL_ALL_FEATURE_COLUMNS
        self.numerical_columns = ARRIVAL_NUMERICAL_FEATURE_COLUMNS
        self.categorical_columns = ARRIVAL_CATEGORICAL_BINARY_FEATURE_COLUMNS
        self.is_fitted = False

    def fit(self, df_train: pd.DataFrame):
        """
        Fits transformation parameters exclusively on the training partition.
        """
        df_clean = df_train.copy()
        for col in self.feature_columns:
            if col not in df_clean.columns:
                df_clean[col] = 0.0

        if self.scale_numerical:
            X_num = df_clean[self.numerical_columns].values.astype(np.float32)
            self.scaler.fit(X_num)

        self.is_fitted = True
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """
        Transforms feature DataFrame into an aligned NumPy feature array.
        """
        if not self.is_fitted and self.scale_numerical:
            raise ValueError("ArrivalClinicalPreprocessor must be fitted on training data before calling transform.")

        df_clean = df.copy()
        for col in self.feature_columns:
            if col not in df_clean.columns:
                df_clean[col] = 0.0

        if self.scale_numerical:
            X_num = self.scaler.transform(df_clean[self.numerical_columns].values.astype(np.float32))
            X_cat = df_clean[self.categorical_columns].values.astype(np.float32)
            return np.hstack([X_num, X_cat])
        else:
            return df_clean[self.feature_columns].values.astype(np.float32)

    def fit_transform(self, df_train: pd.DataFrame) -> np.ndarray:
        self.fit(df_train)
        return self.transform(df_train)

    def save(self, filepath: str):
        joblib.dump({
            "scale_numerical": self.scale_numerical,
            "scaler": self.scaler,
            "feature_columns": self.feature_columns,
            "numerical_columns": self.numerical_columns,
            "categorical_columns": self.categorical_columns,
            "is_fitted": self.is_fitted
        }, filepath)

    @classmethod
    def load(cls, filepath: str) -> "ArrivalClinicalPreprocessor":
        data = joblib.load(filepath)
        prep = cls(scale_numerical=data["scale_numerical"])
        prep.scaler = data["scaler"]
        prep.feature_columns = data["feature_columns"]
        prep.numerical_columns = data["numerical_columns"]
        prep.categorical_columns = data["categorical_columns"]
        prep.is_fitted = data["is_fitted"]
        return prep
