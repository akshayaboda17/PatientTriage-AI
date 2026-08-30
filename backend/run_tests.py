import sys
import os
import unittest
import traceback

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app, get_db
import test_deterioration
import test_physician_review
import test_audit

def run_all_tests():
    # 1. Run Task 9 tests with Task 9 db override
    app.dependency_overrides[get_db] = test_deterioration.override_get_db

    task9_tests = [
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

    print("=" * 65)
    print("RUNNING PATIENTTRIAGE.AI TASK 9 VERIFICATION SUITE")
    print("=" * 65)

    for name, test_fn in task9_tests:
        try:
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

    print("\n" + "=" * 65)
    print("RUNNING PATIENTTRIAGE.AI TASK 10 (PHYSICIAN REVIEW) VERIFICATION SUITE")
    print("=" * 65)

    app.dependency_overrides[get_db] = test_physician_review.override_get_db

    suite10 = unittest.TestLoader().loadTestsFromTestCase(test_physician_review.TestPhysicianReviewWorkflow)
    
    test_physician_review.test_engine.dispose()
    if os.path.exists(test_physician_review.TEST_DB_PATH):
        try:
            os.remove(test_physician_review.TEST_DB_PATH)
        except Exception:
            pass
    test_physician_review.Base.metadata.create_all(bind=test_physician_review.test_engine)

    for test_case in suite10:
        result = unittest.TestResult()
        test_case(result)
        doc = test_case._testMethodDoc or test_case._testMethodName
        if result.wasSuccessful():
            print(f" [PASS] {doc.strip()}")
            passed += 1
        else:
            err = result.failures[0][1] if result.failures else result.errors[0][1]
            print(f" [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            failed += 1

    print("\n" + "=" * 65)
    print("RUNNING PATIENTTRIAGE.AI TASK 11 (CLINICAL AUDIT TRAIL) VERIFICATION SUITE")
    print("=" * 65)

    app.dependency_overrides[get_db] = test_audit.override_get_db

    suite11 = unittest.TestLoader().loadTestsFromTestCase(test_audit.TestClinicalAuditTrail)

    test_audit.test_engine.dispose()
    if os.path.exists(test_audit.TEST_DB_PATH):
        try:
            os.remove(test_audit.TEST_DB_PATH)
        except Exception:
            pass
    test_audit.Base.metadata.create_all(bind=test_audit.test_engine)

    for test_case in suite11:
        result = unittest.TestResult()
        test_case(result)
        doc = test_case._testMethodDoc or test_case._testMethodName
        if result.wasSuccessful():
            print(f" [PASS] {doc.strip()}")
            passed += 1
        else:
            err = result.failures[0][1] if result.failures else result.errors[0][1]
            print(f" [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            failed += 1

    total = len(task9_tests) + suite10.countTestCases() + suite11.countTestCases()
    print("\n" + "=" * 65)
    print(f"COMBINED VERIFICATION SUMMARY: {passed} PASSED, {failed} FAILED (TOTAL {total})")
    print("=" * 65)

    if failed > 0:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    run_all_tests()
