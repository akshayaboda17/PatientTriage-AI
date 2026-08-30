import sys
import os
import time
import unittest
import traceback

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app, get_db
import test_unit_core
import test_integration_clinical_workflow
import test_e2e_workflows
import test_security
import test_deterioration
import test_physician_review
import test_audit

def run_master_test_suite():
    print("=" * 75)
    print("PATIENTTRIAGE.AI — MASTER TESTING & VALIDATION SUITE (TASK 14)")
    print("=" * 75)

    start_total_time = time.time()
    total_passed = 0
    total_failed = 0
    test_results_by_suite = {}

    # 1. UNIT TESTS (test_unit_core.py)
    print("\n[1/7] RUNNING PURE UNIT TESTS (test_unit_core.py)...")
    suite_unit = unittest.TestLoader().loadTestsFromTestCase(test_unit_core.TestUnitCore)
    unit_passed, unit_failed = 0, 0
    for tc in suite_unit:
        res = unittest.TestResult()
        tc(res)
        doc = tc._testMethodDoc or tc._testMethodName
        if res.wasSuccessful():
            print(f"  [PASS] {doc.strip()}")
            unit_passed += 1
        else:
            err = res.failures[0][1] if res.failures else res.errors[0][1]
            print(f"  [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            unit_failed += 1
    test_results_by_suite["Unit Tests (Pure Logic, RBAC, Schemas, Validators)"] = (unit_passed, unit_failed)
    total_passed += unit_passed
    total_failed += unit_failed

    # 2. INTEGRATION TESTS (test_integration_clinical_workflow.py)
    print("\n[2/7] RUNNING CLINICAL WORKFLOW INTEGRATION TESTS (test_integration_clinical_workflow.py)...")
    app.dependency_overrides[get_db] = test_integration_clinical_workflow.override_get_db
    test_integration_clinical_workflow.test_engine.dispose()
    if os.path.exists(test_integration_clinical_workflow.TEST_DB_PATH):
        try: os.remove(test_integration_clinical_workflow.TEST_DB_PATH)
        except Exception: pass
    test_integration_clinical_workflow.Base.metadata.create_all(bind=test_integration_clinical_workflow.test_engine)

    suite_integ = unittest.TestLoader().loadTestsFromTestCase(test_integration_clinical_workflow.TestIntegrationClinicalWorkflow)
    integ_passed, integ_failed = 0, 0
    for tc in suite_integ:
        res = unittest.TestResult()
        tc(res)
        doc = tc._testMethodDoc or tc._testMethodName
        if res.wasSuccessful():
            print(f"  [PASS] {doc.strip()}")
            integ_passed += 1
        else:
            err = res.failures[0][1] if res.failures else res.errors[0][1]
            print(f"  [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            integ_failed += 1
    test_results_by_suite["Clinical Workflow Integration Tests"] = (integ_passed, integ_failed)
    total_passed += integ_passed
    total_failed += integ_failed

    # 3. END-TO-END WORKFLOWS (test_e2e_workflows.py)
    print("\n[3/7] RUNNING COMPLETE END-TO-END WORKFLOW TESTS (test_e2e_workflows.py)...")
    app.dependency_overrides[get_db] = test_e2e_workflows.override_get_db
    test_e2e_workflows.test_engine.dispose()
    if os.path.exists(test_e2e_workflows.TEST_DB_PATH):
        try: os.remove(test_e2e_workflows.TEST_DB_PATH)
        except Exception: pass
    test_e2e_workflows.Base.metadata.create_all(bind=test_e2e_workflows.test_engine)

    suite_e2e = unittest.TestLoader().loadTestsFromTestCase(test_e2e_workflows.TestE2EWorkflows)
    e2e_passed, e2e_failed = 0, 0
    for tc in suite_e2e:
        res = unittest.TestResult()
        tc(res)
        doc = tc._testMethodDoc or tc._testMethodName
        if res.wasSuccessful():
            print(f"  [PASS] {doc.strip()}")
            e2e_passed += 1
        else:
            err = res.failures[0][1] if res.failures else res.errors[0][1]
            print(f"  [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            e2e_failed += 1
    test_results_by_suite["End-to-End Workflow Tests (Happy & Failure Path)"] = (e2e_passed, e2e_failed)
    total_passed += e2e_passed
    total_failed += e2e_failed

    # 4. SECURITY & PRIVACY HARDENING (test_security.py)
    print("\n[4/7] RUNNING SECURITY & PRIVACY ATTACK TESTS (test_security.py)...")
    app.dependency_overrides[get_db] = test_security.override_get_db
    test_security.test_engine.dispose()
    if os.path.exists(test_security.TEST_DB_PATH):
        try: os.remove(test_security.TEST_DB_PATH)
        except Exception: pass
    test_security.Base.metadata.create_all(bind=test_security.test_engine)

    suite_sec = unittest.TestLoader().loadTestsFromTestCase(test_security.TestSecurityAndPrivacyHardening)
    sec_passed, sec_failed = 0, 0
    for tc in suite_sec:
        res = unittest.TestResult()
        tc(res)
        doc = tc._testMethodDoc or tc._testMethodName
        if res.wasSuccessful():
            print(f"  [PASS] {doc.strip()}")
            sec_passed += 1
        else:
            err = res.failures[0][1] if res.failures else res.errors[0][1]
            print(f"  [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            sec_failed += 1
    test_results_by_suite["Security & Privacy Hardening Matrix (Task 13)"] = (sec_passed, sec_failed)
    total_passed += sec_passed
    total_failed += sec_failed

    # 5. DETERIORATION & ALERTS (test_deterioration.py)
    print("\n[5/7] RUNNING DETERIORATION & ALERTS VERIFICATION (test_deterioration.py)...")
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
    det_passed, det_failed = 0, 0
    for name, test_fn in task9_tests:
        try:
            generator = test_deterioration.setup_database()
            next(generator)
            test_fn()
            try: next(generator)
            except StopIteration: pass
            print(f"  [PASS] {name}")
            det_passed += 1
        except Exception as e:
            print(f"  [FAIL] {name}: {e}")
            det_failed += 1
    test_results_by_suite["Deterioration & Alerts (Task 9)"] = (det_passed, det_failed)
    total_passed += det_passed
    total_failed += det_failed

    # 6. PHYSICIAN REVIEW & OVERRIDE (test_physician_review.py)
    print("\n[6/7] RUNNING PHYSICIAN REVIEW & AI OVERRIDE TESTS (test_physician_review.py)...")
    app.dependency_overrides[get_db] = test_physician_review.override_get_db
    test_physician_review.test_engine.dispose()
    if os.path.exists(test_physician_review.TEST_DB_PATH):
        try: os.remove(test_physician_review.TEST_DB_PATH)
        except Exception: pass
    test_physician_review.Base.metadata.create_all(bind=test_physician_review.test_engine)

    suite10 = unittest.TestLoader().loadTestsFromTestCase(test_physician_review.TestPhysicianReviewWorkflow)
    pr_passed, pr_failed = 0, 0
    for tc in suite10:
        res = unittest.TestResult()
        tc(res)
        doc = tc._testMethodDoc or tc._testMethodName
        if res.wasSuccessful():
            print(f"  [PASS] {doc.strip()}")
            pr_passed += 1
        else:
            err = res.failures[0][1] if res.failures else res.errors[0][1]
            print(f"  [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            pr_failed += 1
    test_results_by_suite["Physician Review & AI Override (Task 10)"] = (pr_passed, pr_failed)
    total_passed += pr_passed
    total_failed += pr_failed

    # 7. CLINICAL AUDIT TRAIL (test_audit.py)
    print("\n[7/7] RUNNING CLINICAL AUDIT TRAIL TESTS (test_audit.py)...")
    app.dependency_overrides[get_db] = test_audit.override_get_db
    test_audit.test_engine.dispose()
    if os.path.exists(test_audit.TEST_DB_PATH):
        try: os.remove(test_audit.TEST_DB_PATH)
        except Exception: pass
    test_audit.Base.metadata.create_all(bind=test_audit.test_engine)

    suite11 = unittest.TestLoader().loadTestsFromTestCase(test_audit.TestClinicalAuditTrail)
    aud_passed, aud_failed = 0, 0
    for tc in suite11:
        res = unittest.TestResult()
        tc(res)
        doc = tc._testMethodDoc or tc._testMethodName
        if res.wasSuccessful():
            print(f"  [PASS] {doc.strip()}")
            aud_passed += 1
        else:
            err = res.failures[0][1] if res.failures else res.errors[0][1]
            print(f"  [FAIL] {doc.strip()}: {err.splitlines()[-1]}")
            aud_failed += 1
    test_results_by_suite["Clinical Audit Trail (Task 11)"] = (aud_passed, aud_failed)
    total_passed += aud_passed
    total_failed += aud_failed

    total_time = time.time() - start_total_time

    # SUMMARY REPORT
    print("\n" + "=" * 75)
    print("PATIENTTRIAGE.AI — VALIDATION & TEST EXECUTION SUMMARY")
    print("=" * 75)
    print(f"{'Test Suite Category':<60} | {'Pass':<6} | {'Fail':<6}")
    print("-" * 75)
    for category, (p, f) in test_results_by_suite.items():
        print(f"{category:<60} | {p:<6} | {f:<6}")
    print("-" * 75)
    print(f"{'TOTAL TESTS EXECUTED':<60} | {total_passed:<6} | {total_failed:<6}")
    print(f"Total Execution Time: {total_time:.2f}s")
    print("=" * 75)

    if total_failed > 0:
        print(f"\n[FAILED] VALIDATION FAILED: {total_failed} test(s) failed.")
        sys.exit(1)
    else:
        print(f"\n[PASSED] VALIDATION PASSED: All {total_passed} tests passed successfully!")
        sys.exit(0)

if __name__ == "__main__":
    run_master_test_suite()
