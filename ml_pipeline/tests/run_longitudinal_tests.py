"""
Test runner for Task 3 Longitudinal Deterioration Model Tests.
"""
import os
import sys

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from ml_pipeline.tests.test_longitudinal_deterioration import (
    test_1_multiple_observation_preservation,
    test_2_trajectory_deltas_and_velocities,
    test_3_temporal_anti_leakage_guards,
    test_4_deterministic_safety_interlock,
    test_5_calibrated_ml_trajectory_inference,
    test_6_explainable_comparison_generation
)

def run_tests():
    print("=" * 80)
    print("RUNNING LONGITUDINAL PATIENT DETERIORATION MODEL UNIT TEST SUITE")
    print("=" * 80)

    tests = [
        ("Test 1: Multiple observation sequence preservation and chronological sorting", test_1_multiple_observation_preservation),
        ("Test 2: Sequential rates of change (velocities) and multi-point slopes", test_2_trajectory_deltas_and_velocities),
        ("Test 3: Temporal anti-leakage guards & forward truncation", test_3_temporal_anti_leakage_guards),
        ("Test 4: Deterministic safety interlocks for catastrophic vitals", test_4_deterministic_safety_interlock),
        ("Test 5: Calibrated ML trajectory model inference & priority escalation", test_5_calibrated_ml_trajectory_inference),
        ("Test 6: Transparent explanation generation & exact delta attribution", test_6_explainable_comparison_generation)
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
