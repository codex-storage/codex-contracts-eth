set -e

npm run deploy

if [ -n "$KEEP_ALIVE" ]; then
    echo "Done! Sleeping indefinitely..."
    while true; do sleep 1d; done
fi
