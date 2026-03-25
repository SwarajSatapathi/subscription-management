#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

#[test]
fn test_subscription() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SubscriptionContract);
    let client = SubscriptionContractClient::new(&env, &contract_id);
    let user = Address::generate(&env);

    // Initial state: not active
    assert_eq!(client.is_active(&user), false);
    assert_eq!(client.get_expiry(&user), 0);

    // Set ledger time to 1000
    env.ledger().set_timestamp(1000);

    // Subscribe for 3600 seconds (1 hour)
    // Needs user auth, so we use `mock_all_auths` to bypass signature checks in test
    client.mock_all_auths().subscribe(&user, &3600);

    // After subscription: expiry should be 1000 + 3600 = 4600
    assert_eq!(client.get_expiry(&user), 4600);
    assert_eq!(client.is_active(&user), true);

    // Extend subscription immediately for another 3600 seconds
    client.mock_all_auths().subscribe(&user, &3600);

    // Expiry should now be 4600 + 3600 = 8200
    assert_eq!(client.get_expiry(&user), 8200);

    // Fast forward time to 5000, user is still active (5000 < 8200)
    env.ledger().set_timestamp(5000);
    assert_eq!(client.is_active(&user), true);

    // Fast forward time to 9000, user should be inactive (9000 >= 8200)
    env.ledger().set_timestamp(9000);
    assert_eq!(client.is_active(&user), false);

    // Resubscribe after expiration, for 3600 seconds
    client.mock_all_auths().subscribe(&user, &3600);
    // Since current time is 9000, new expiry is 9000 + 3600 = 12600
    assert_eq!(client.get_expiry(&user), 12600);
    assert_eq!(client.is_active(&user), true);
}
