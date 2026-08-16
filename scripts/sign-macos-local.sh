#!/bin/bash
# Ad-hoc code signing for local development builds (no Apple certificate needed)
codesign --force --deep --sign - "$1"
