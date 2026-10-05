"""Store tester (03 §7.2): cart, coupons, stock and checkout — up to payment, never beyond."""

from __future__ import annotations

from agent.templates.base import ScenarioTemplate, TestTemplate

STORE = TestTemplate(
    key="store",
    title="Store & checkout",
    description="Cart, coupons, stock, checkout up to payment",
    recon_keywords=[
        "shop",
        "store",
        "products",
        "catalog",
        "collection",
        "cart",
        "basket",
        "bag",
        "checkout",
        "product",
    ],
    scenario_prefix="ST",
    test_data_keys=[
        "quantities",
        "coupon_guesses",
        "valid_name",
        "valid_email",
        "valid_phone",
        "valid_address",
        "valid_city",
        "valid_postal_codes",
    ],
    planner_notes=(
        "Use a product that is in stock unless the scenario is about stock. Coupon codes from "
        "the user's goal text come first; codes visible on the site next; otherwise INVALID123. "
        "Never pay: reaching the payment page ends the test."
    ),
    scenarios=[
        ScenarioTemplate(
            id="ST1",
            title="Add an in-stock product to the cart",
            kind="happy_path",
            area="cart",
            goal="A product can be added to the cart.",
            steps_intent=["Open an in-stock product", "Add it to the cart", "Open the cart"],
            expected_result="The cart shows the item with the correct price.",
            clean_state=True,
            severity_hint="critical",
        ),
        ScenarioTemplate(
            id="ST2",
            title="Change quantity, including invalid values",
            kind="edge_case",
            area="cart",
            goal="Quantity changes update totals; zero/negative values are handled safely.",
            steps_intent=[
                "Put one in-stock product in the cart",
                "Set quantity to 3, update",
                "Set quantity to -2, update",
                "Check line total and order total",
            ],
            expected_result="Totals update correctly for 3; -2 is rejected (or the item is "
            "removed) and no total ever becomes negative.",
            test_data_keys=["quantities"],
            clean_state=True,
            severity_hint="critical",
        ),
        ScenarioTemplate(
            id="ST3",
            title="Remove an item from the cart",
            kind="happy_path",
            area="cart",
            goal="An item can be removed from the cart.",
            steps_intent=["Put one product in the cart", "Click its remove/delete control"],
            expected_result="The item disappears from the cart and totals update.",
            clean_state=True,
        ),
        ScenarioTemplate(
            id="ST4",
            title="Apply a valid and an expired or invalid coupon",
            kind="negative",
            area="coupon",
            goal="Valid coupons apply; expired/invalid ones are refused.",
            steps_intent=[
                "Put one product in the cart",
                "Apply the expired or invalid coupon and check the result",
                "Apply the valid coupon if one is known and check the discount",
            ],
            expected_result="An expired/invalid code shows an error and gives no discount; a "
            "valid code applies the right discount.",
            test_data_keys=["coupon_guesses"],
            clean_state=True,
        ),
        ScenarioTemplate(
            id="ST5",
            title="Try to buy an out-of-stock product",
            kind="negative",
            area="stock",
            goal="Out-of-stock products cannot be bought.",
            steps_intent=[
                "Find a product marked out of stock / sold out",
                "Try to add it to the cart",
                "If added, try to proceed to checkout",
            ],
            expected_result="It cannot be added to the cart, or checkout is refused with a "
            "clear message.",
            clean_state=True,
        ),
        ScenarioTemplate(
            id="ST6",
            title="Checkout form with missing or invalid fields",
            kind="negative",
            area="checkout",
            goal="The checkout form validates fields with clear errors.",
            steps_intent=[
                "Put one product in the cart and go to checkout",
                "Submit with a required field empty and check the errors",
                "Fill valid data but a postal code with a space, submit",
            ],
            expected_result="Clear field errors for missing/invalid data; a valid postal code "
            "(also with a space) is accepted or gets a clear message.",
            test_data_keys=[
                "valid_name",
                "valid_email",
                "valid_phone",
                "valid_address",
                "valid_city",
                "valid_postal_codes",
            ],
            clean_state=True,
            severity_hint="minor",
        ),
        ScenarioTemplate(
            id="ST7",
            title="Complete checkout up to the payment step",
            kind="happy_path",
            area="checkout",
            goal="A shopper can reach the payment step with a correct summary.",
            steps_intent=[
                "Put one product in the cart",
                "Go to checkout",
                "Fill the shipping form with valid data",
                "Continue",
                "Stop on the payment page; do not pay",
            ],
            expected_result="The payment page is reached and the order summary matches the "
            "cart. Stop there.",
            test_data_keys=[
                "valid_name",
                "valid_email",
                "valid_phone",
                "valid_address",
                "valid_city",
                "valid_postal_codes",
            ],
            clean_state=True,
            severity_hint="critical",
        ),
    ],
)
