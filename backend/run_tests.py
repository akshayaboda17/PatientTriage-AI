import sys
import os
import traceback

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import test_deterioration

def run_all_tests():
    test_functions = [
        ("Longitudinal Trend Detection", test_deterioration.test_longitudinal_trend_detection),
        ("No Deterioration on Stable Vitals", test_deterioration.test_no_deterioration_on_stable_vitals),
        ("Missing / Insufficient Data Protection", test_deterioration.test_missing_insufficient_data_protection),
        ("Alert Deduplication", test_deterioration.test_alert_deduplication),
        ("Alert Lifecycle Transitions", test_deterioration.test_alert_lifecycle_transitions),
        ("API Acknowledge Success", test_deterioration.test_api_acknowledge_success),
        ("API Unauthorized Role Rejection", test_deterioration.test_api_unauthorized_role_rejection),
        ("API Cross-Hospital Isolation Rejection", test_deterioration.test_api_cross_hospital_isolation_rejection),
        ("API Deactivated Staff Rejection", test_deterioration.test_api_deactivated_staff_rejection),
        ("Task 7 Independence (High Risk != Deterioration)", test_deterioration.test_task7_ai_high_risk_does_not_force_deterioration_without_trend),
    ]

    passed = 0
    failed = 0

    print("=" * 60)
    print("RUNNING PATIENTTRIAGE.AI TASK 9 VERIFICATION SUITE")
    print("=" * 60)

    for name, test_fn in test_functions:
        try:
            # Setup database fixture for tests that need it
            generator = test_deterioration.setup_database()
            next(generator)
            
            test_fn()
            
            try:
                next(generator)
            except StopIteration:
                pass

            print(f" [PASS] {name}")
            passed += 1
        except Exception as e:
            print(f" [FAIL] {name}: {e}")
            traceback.print_exc()
            failed += 1

    print("=" * 60)
    print(f"SUMMARY: {passed} PASSED, {failed} FAILED (TOTAL {len(test_functions)})")
    print("=" * 60)

    if failed > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    run_all_tests()
