#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Expiry(Address),
}

#[contract]
pub struct SubscriptionContract;

#[contractimpl]
impl SubscriptionContract {
    /// Sets or extends subscription by duration (in seconds)
    pub fn subscribe(env: Env, user: Address, duration: u64) {
        user.require_auth();

        let current_time = env.ledger().timestamp();
        let key = DataKey::Expiry(user.clone());
        let current_expiry: u64 = env.storage().persistent().get(&key).unwrap_or(0);

        let new_expiry = if current_time < current_expiry {
            // Subscription is still active, extend it by `duration`
            current_expiry.checked_add(duration).unwrap()
        } else {
            // Subscription is inactive or brand new, start from `current_time`
            current_time.checked_add(duration).unwrap()
        };

        // Store the new expiry timestamp
        env.storage().persistent().set(&key, &new_expiry);
        
        // Extend the TTL for the storage to avoid archival in a real environment
        // env.storage().persistent().extend_ttl(&key, 10000, 100000);
    }

    /// Returns true if the subscription is still valid
    pub fn is_active(env: Env, user: Address) -> bool {
        let key = DataKey::Expiry(user);
        let expiry: u64 = env.storage().persistent().get(&key).unwrap_or(0);
        
        env.ledger().timestamp() < expiry
    }

    /// Returns the exact expiry timestamp
    pub fn get_expiry(env: Env, user: Address) -> u64 {
        let key = DataKey::Expiry(user);
        env.storage().persistent().get(&key).unwrap_or(0)
    }
}
