#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    echo "Usage: $0 <vscode|cursor>"
    echo ""
    echo "Builds and installs the GROQ VS Code extension."
    echo ""
    echo "Arguments:"
    echo "  vscode    Install to Visual Studio Code"
    echo "  cursor    Install to Cursor"
    echo ""
    echo "Options:"
    echo "  -h, --help    Show this help message"
    exit "${1:-1}"
}

if [[ $# -ne 1 ]]; then
    usage
fi

case "$1" in
    -h|--help)
        usage 0
        ;;
    vscode)
        EDITOR_CMD="code"
        ;;
    cursor)
        EDITOR_CMD="cursor"
        ;;
    *)
        echo "Error: Invalid argument '$1'"
        echo ""
        usage
        ;;
esac

cd "$PROJECT_ROOT"

echo "Building extension..."
npm run build:vscode

echo "Packaging extension..."
cd "$PROJECT_ROOT/editors/vscode"
npm run package

VSIX_FILE=$(ls -1 "$PROJECT_ROOT/editors/vscode"/groq-vscode-*.vsix 2>/dev/null | head -n 1)

if [[ -z "$VSIX_FILE" ]]; then
    echo "Error: No .vsix file found in editors/vscode/"
    exit 1
fi

echo "Installing $VSIX_FILE to $1..."
"$EDITOR_CMD" --install-extension "$VSIX_FILE"

echo "Done. Extension installed to $1."
