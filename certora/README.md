# Formal Verification of Vault

All funds in Codex are handled by the Vault contract.  This is a
small contract that separates funds for different users and checks
that accounting is done correctly.  In addition it allows the users
to withdraw their funds after the locks expired, even if the main
contract breaks.  Thus it gives users a guarantee they can always
access their funds.

This guarantee requires that the accounting the Vault itself does
is correct.  This is the goal of the verification project.  It
formally proves several properties of the Vault contract.

## Usage

Install the Certora Prover.  Then run the verification with

certoraRun certora/confs/Vault.conf

## Properties

We check several properties for the Vault contract:

1. The current lock expiry time is always less or equal the lockMaximum.
2. The available balance of each account is large enoguh to cover
   the outgoing flow until the maximum lock time.
3. The sum of all incoming flows equals the sum of all outgoing flows.
4. The sum of all expected funds (as defined in property 7) is always less
   than or equal to the current balance of the contract. 
5. Before a fund id is locked and flows can start, there is never an
   outgoing flow for any account in this fund.
6. The last updated timestamp for flows in each account is never in 
   the future and always on or before the lock time.
7. The expected funds for each account is the available balance plus the
   dedicated balance plus the incoming flows minus the outgoing flows
   from the last time updated until the end of the flow (either lock
   time or freeze time).  These funds are always non-negative (i.e. no
   account can be in debt to the protocol in the future due to outgoing
   flows).

The forth property (solvency) is the main property we need to show to
guarantee that the funds are accounted correctly.

## Limitations

We prove the solvency invariant only for a standard ERC20 token as
implemented in the OpenZepellin library.  In particular, the contract
assumes that transfering tokens work as expected, that no fee is taken
by the token contract and that no unexpected balance changes can occur.

To prove that changing the lock time or freezing the funds does not change
the funds required by the contract, we cannot use the Certora Prover itself
 as the underlying SMT solvers cannot natively reason about sums over
all elements in a mapping.  Instead we add this as an assumption to the
specification and argue its correctness property manually as follows.

Changing the lock time or freezing the funds will change the expected
balance because the time where the flows end changes.  It will change the
expected funds of each account by `timedelta*(incoming - outgoing)` where
`timedelta` is the difference of the previous and the new end time of
flows.  So the sum of all expected funds is changed by 
`timedelta*(sum of incoming - sum of outgoing)`.  This is zero because
of Property 3.

