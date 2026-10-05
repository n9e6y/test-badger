"""Registration tester (03 §7.1): signup with valid and invalid data, then login."""

from __future__ import annotations

from agent.templates.base import ScenarioTemplate, TestTemplate

REGISTRATION = TestTemplate(
    key="registration",
    title="Registration",
    description="Signup with valid and invalid data, then login",
    recon_keywords=[
        "sign up",
        "signup",
        "register",
        "create account",
        "join",
        "log in",
        "login",
        "account",
    ],
    scenario_prefix="R",
    test_data_keys=[
        "valid_name",
        "valid_email",
        "invalid_emails",
        "valid_password",
        "weak_passwords",
        "mismatch_password",
    ],
    planner_notes=(
        "R1 creates the account that R5 and R6 reuse: they must use exactly R1's email and "
        "password. Start every signup scenario on the signup page with a fresh session."
    ),
    scenarios=[
        ScenarioTemplate(
            id="R1",
            title="Sign up with valid data",
            kind="happy_path",
            area="signup",
            goal="A new user can create an account with valid data.",
            steps_intent=["Open the signup form", "Fill every field with valid data", "Submit"],
            expected_result="The account is created: a success/welcome page or the user is "
            "logged in. No error is shown.",
            test_data_keys=["valid_name", "valid_email", "valid_password"],
            clean_state=True,
            severity_hint="critical",
        ),
        ScenarioTemplate(
            id="R2",
            title="Submit with required fields empty",
            kind="negative",
            area="signup",
            goal="Empty required fields are rejected with clear messages.",
            steps_intent=["Open the signup form", "Leave the fields empty", "Submit"],
            expected_result="Clear error messages for the empty fields; no account is created; "
            "no server error page.",
            clean_state=True,
            severity_hint="critical",
        ),
        ScenarioTemplate(
            id="R3",
            title="Sign up with an invalid email",
            kind="negative",
            area="signup",
            goal="An invalid email address is rejected.",
            steps_intent=["Open the signup form", "Fill valid data but an invalid email", "Submit"],
            expected_result="An error about the email is shown and no account is created.",
            test_data_keys=["valid_name", "invalid_emails", "valid_password"],
            clean_state=True,
        ),
        ScenarioTemplate(
            id="R4",
            title="Mismatched or weak password",
            kind="negative",
            area="signup",
            goal="Mismatched confirmation and weak passwords are rejected.",
            steps_intent=[
                "Open the signup form",
                "Use a confirmation that does not match the password, submit",
                "If the site accepts it, that is the bug; otherwise also try a weak password",
            ],
            expected_result="A password error is shown and no account is created.",
            test_data_keys=[
                "valid_name",
                "valid_email",
                "valid_password",
                "mismatch_password",
                "weak_passwords",
            ],
            clean_state=True,
        ),
        ScenarioTemplate(
            id="R5",
            title="Sign up again with an existing email",
            kind="negative",
            area="signup",
            goal="A second signup with R1's email is refused.",
            steps_intent=[
                "Open the signup form",
                "Sign up with exactly the same email as R1",
                "Submit",
            ],
            expected_result='An "account already exists" style error is shown.',
            test_data_keys=["valid_name", "valid_email", "valid_password"],
            depends_on=["R1"],
            clean_state=True,
        ),
        ScenarioTemplate(
            id="R6",
            title="Log in with the new account",
            kind="happy_path",
            area="login",
            goal="The account from R1 can log in.",
            steps_intent=["Open the login page", "Log in with R1's email and password"],
            expected_result="Login succeeds and the account page shows the user's name.",
            test_data_keys=["valid_email", "valid_password"],
            depends_on=["R1"],
            clean_state=True,
            severity_hint="critical",
        ),
    ],
)
