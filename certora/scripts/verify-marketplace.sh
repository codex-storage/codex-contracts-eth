if [[ "$1" ]]
then
  RULE="--rule $1"
fi

if [[ "$2" ]]
then
  MSG="- $2"
fi

certoraRun \
  contracts/Marketplace.sol \
  certora/harness/MarketplaceHarness.sol \
--verify MarketplaceHarness:certora/specs/Marketplace.spec \
--optimistic_loop \
--loop_iter 3 \
--rule_sanity "basic" \
$RULE \
--msg "Verifying Marketplace.sol $RULE $MSG"
