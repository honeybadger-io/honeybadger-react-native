#!/bin/bash

# ----------------------------------------------------------------------------
#
# Honeybadger.io
# Generate iOS and Android source maps for React Native.
# The main.jsbundle files for iOS and Android are also generated.
#
# USAGE:
# npx honeybadger-generate-sourcemaps
#
# ----------------------------------------------------------------------------

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
PROJECT_ROOT_DIR="$SCRIPT_DIR/../../"
INDEX_FILE="$PROJECT_ROOT_DIR/index.js"

# Check if index.js file exists and if try to search for .ts or .tsx equivalent

if [[ ! -f "$INDEX_FILE" ]]; then
	if [[ -f "$PROJECT_ROOT_DIR/index.tsx" ]]; then
		INDEX_FILE="$PROJECT_ROOT_DIR/index.tsx"
	else
		if [[ -f "$PROJECT_ROOT_DIR/index.ts" ]]; then
			INDEX_FILE="$PROJECT_ROOT_DIR/index.ts"
		else
			echo "Couldn't find index file"
			exit 1
		fi
	fi
fi

echo "Generating source maps for iOS ..."
npx react-native bundle --platform ios --entry-file "$INDEX_FILE" --dev false --reset-cache --bundle-output main.jsbundle-ios --assets-dest /dev/null --sourcemap-output sourcemap-ios --sourcemap-sources-root "PROJECT_ROOT_DIR" > /dev/null 2>&1

echo "Generating source maps for Android ..."
npx react-native bundle --platform android --entry-file "$INDEX_FILE" --dev false --reset-cache --bundle-output main.jsbundle-android --assets-dest /dev/null --sourcemap-output sourcemap-android --sourcemap-sources-root "PROJECT_ROOT_DIR" > /dev/null 2>&1

echo "Done. Your project root directory now contains sourcemap-ios, sourcemap-android, main.jsbundle-ios, and main.jsbundle-android."
