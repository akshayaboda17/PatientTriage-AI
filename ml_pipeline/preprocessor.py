import joblib
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Optional
from sklearn.preprocessing import StandardScaler
from ml_pipeline.schema import (
    ALL_FEATURE_COLUMNS,
    NUMERICAL_FEATURE_COLUMNS,
    CATEGORICAL_BINARY_FEATURE_COLUMNS
)

class ClinicalPreprocessor:
    """
    Standardizes and prepares numerical/categorical feature matrices for model consumption.
    Fits only on training partitions to strictly avoid test data leakage.
    """

    def __init__(self, scale_numerical: bool = False):
        self.scale_numerical = scale_numerical
        self.scaler = StandardScaler() if scale_numerical else None
        self.feature_columns = ALL_FEATURE_COLUMNS
        self.is_fitted = False

    def fit(self, df_train: pd.DataFrame):
        """
        Fits scaler parameters exclusively on the training partition.
        """
        X_num = df_train[NUMERICAL_FEATURE_COLUMNS].values
        if self.scale_numerical:
            self.scaler.fit(X_num)
        self.is_fitted = True
        return self

    def transform(self, df: pd.DataFrame) -> np.ndarray:
        """
        Transforms a DataFrame of features into a formatted NumPy array matching the schema.
        """
        if not self.is_fitted and self.scale_numerical:
            raise ValueError("ClinicalPreprocessor must be fitted on training data before calling transform.")

        # Ensure all columns exist in expected schema order
        df_ordered = df.copy()
        for col in self.feature_columns:
            if col not in df_ordered.columns:
                df_ordered[col] = 0.0

        if self.scale_numerical:
            X_num = self.scaler.transform(df_ordered[NUMERICAL_FEATURE_COLUMNS].values)
            X_cat = df_ordered[CATEGORICAL_BINARY_FEATURE_COLUMNS].values
            return np.hstack([X_num, X_cat])
        else:
            return df_ordered[self.feature_columns].values.astype(np.float32)

    def fit_transform(self, df_train: pd.DataFrame) -> np.ndarray:
        self.fit(df_train)
        return self.transform(df_train)

    def save(self, filepath: str):
        joblib.dump({
            "scale_numerical": self.scale_numerical,
            "scaler": self.scaler,
            "feature_columns": self.feature_columns,
            "is_fitted": self.is_fitted
        }, filepath)

    @classmethod
    def load(cls, filepath: str) -> "ClinicalPreprocessor":
        data = joblib.load(filepath)
        preprocessor = cls(scale_numerical=data["scale_numerical"])
        preprocessor.scaler = data["scaler"]
        preprocessor.feature_columns = data["feature_columns"]
        preprocessor.is_fitted = data["is_fitted"]
        return preprocessor
