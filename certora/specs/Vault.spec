methods {
    
}

rule sanity(env e, method f) {
    calldataarg args;
    f(e, args);
    satisfy true;
}

// ghost mapping(Vault.Controller => mapping(Vault.FundId => Vault.Timestamp)) ghostName;
    // init_state axiom forall uint256 a. ghostName[a] == 0;

ghost mapping(VaultBase.Controller => mapping(VaultBase.FundId => VaultBase.Timestamp)) ghostName {
    init_state axiom forall VaultBase.Controller controller. forall VaultBase.FundId fundId. ghostName[controller][fundId] == 0;
}
// mapping(Controller => mapping(FundId => Fund)) private _funds;
hook Sload VaultBase.Timestamp defaultValue _funds[KEY VaultBase.Controller Controller][KEY VaultBase.FundId FundId] {
    require ghostName[Controller][FundId] == require_uint40(defaultValue);
}




// (∀ controller ∈ Controller, fundId ∈ FundId:
//   fund.lockExpiry <= fund.lockMaximum
//   where fund = _funds[controller][fundId])
// STATUS - in progress 
// invariant lockExpiryLELockMaximum()
