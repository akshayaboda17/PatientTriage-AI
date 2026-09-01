"""
Test runner for Task 4 Unit Tests (Age-Aware, Data Quality, Negation, Ambiguity, Input Bounds).
"""
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from ml_pipeline.tests.test_task4_age_and_data_quality import (
    test_case_1_ambiguous_symptoms,
    test_case_2_pediatric_patient,
    test_case_3_geriatric_patient,
    test_case_4_adult_patient,
    test_case_5_zero_history_patient,
    test_case_6_missing_spo2,
    test_case_7_missing_history,
    test_case_8_explicitly_denied_symptom,
    test_case_9_invalid_clinical_input,
    test_case_10_high_acuity_uncertainty_escalation
)

def run_tests():
    print("=" * 80)
    print("RUNNING TASK 4 AGE-AWARE & DATA-QUALITY UNIT TEST SUITE")
    print("=" * 80)

    tests = [
        ("Case 1: Ambiguous non-specific multi-system symptom presentation", test_case_1_ambiguous_symptoms),
        ("Case 2: Pediatric patient age-aware extraction and evaluation", test_case_2_pediatric_patient),
        ("Case 3: Geriatric patient blunted response and tachypnea handling", test_case_3_geriatric_patient),
        ("Case 4: Adult patient standard workflow", test_case_4_adult_patient),
        ("Case 5: Zero-history patient (first visit, unregistered)", test_case_5_zero_history_patient),
        ("Case 6: Missing SpO2 parameter and intake caveat reporting", test_case_6_missing_spo2),
        ("Case 7: Missing / unknown medical history handling", test_case_7_missing_history),
        ("Case 8: Explicitly denied symptom text negation parsing", test_case_8_explicitly_denied_symptom),
        ("Case 9: Invalid clinical input physiological bounds validation", test_case_9_invalid_clinical_input),
        ("Case 10: High-acuity symptoms and uncertainty escalation", test_case_10_high_acuity_uncertainty_escalation)
    ]

    passed = 0
    for name, test_fn in tests:
        try:
            test_fn()
            print(f"[PASS] {name}")
            passed += 1
        except Exception as e:
            print(f"[FAIL] {name}: {e}")
            import traceback
            traceback.print_exc()

    print("=" * 80)
    print(f"RESULTS: {passed}/{len(tests)} TESTS PASSED ({passed/len(tests)*100:.1f}% SUCCESS RATE)")
    print("=" * 80)
    return passed == len(tests)

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
