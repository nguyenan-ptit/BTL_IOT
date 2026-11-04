# Native firmware checks

These tests exercise the firmware's actual parsers, timer/output policy,
threshold record validation and persistence recovery. The filesystem/ESP stubs
operate in memory. No backend source, MQTT broker, ESP or physical output is
used by these checks.

Run commands from the repository root. Required dependencies:

- A C++17 compiler such as GCC or Clang.
- The ArduinoJson **6.21.5** source headers; set the include path to its `src`
  directory. ArduinoJson 7 is not the version used for these checks.
- OpenSSL development headers and `libcrypto`, required by the discovery HMAC
  test. The test verifies public fixtures with an independent HMAC provider;
  the ESP build uses BearSSL supplied by its ESP8266 core.

The hexadecimal HMAC key, request IDs and IP addresses in the test source are
public test fixtures. They are not production discovery keys or connection
credentials.

## Linux/macOS or a compatible shell

Adjust the ArduinoJson path and compiler name for your installation. If OpenSSL
is installed outside the compiler's default search paths, add its include and
library flags as supplied by your package manager.

```sh
ARDUINOJSON_INCLUDE="/path/to/ArduinoJson/src"
NATIVE_OUTPUT="${TMPDIR:-/tmp}/btl-iot-native"
mkdir -p "$NATIVE_OUTPUT"

g++ -std=c++17 -Wall -Wextra -Werror -DALARM_POLICY_SELF_TEST \
  -I"$ARDUINOJSON_INCLUDE" -Itests/firmware_stubs \
  tests/firmware_remote_thresholds.cpp \
  -o "$NATIVE_OUTPUT/firmware_remote_thresholds"

g++ -std=c++17 -Wall -Wextra -Werror -DALARM_POLICY_SELF_TEST \
  -I"$ARDUINOJSON_INCLUDE" tests/firmware_remote_actions.cpp \
  -lcrypto -o "$NATIVE_OUTPUT/firmware_remote_actions"

"$NATIVE_OUTPUT/firmware_remote_thresholds"
"$NATIVE_OUTPUT/firmware_remote_actions"
```

## Windows PowerShell

Use an environment where GCC, OpenSSL headers/libraries and their runtime DLLs
are on the appropriate search paths, for example a matching MSYS2 UCRT64
toolchain. Replace the example ArduinoJson include path with your local path.
Keep generated executables outside the repository:

```powershell
$arduinoJsonInclude = 'C:\path\to\ArduinoJson\src'
$nativeOutput = Join-Path ([IO.Path]::GetTempPath()) 'btl-iot-native'
New-Item -ItemType Directory -Force $nativeOutput | Out-Null

g++ -std=c++17 -Wall -Wextra -Werror -DALARM_POLICY_SELF_TEST "-I$arduinoJsonInclude" -Itests/firmware_stubs tests/firmware_remote_thresholds.cpp -o "$nativeOutput/firmware_remote_thresholds.exe"
g++ -std=c++17 -Wall -Wextra -Werror -DALARM_POLICY_SELF_TEST "-I$arduinoJsonInclude" tests/firmware_remote_actions.cpp -lcrypto -o "$nativeOutput/firmware_remote_actions.exe"

& "$nativeOutput/firmware_remote_thresholds.exe"
& "$nativeOutput/firmware_remote_actions.exe"
```

Each executable prints a `PASS` line and exits successfully when its checks
pass. `ALARM_POLICY_SELF_TEST` also enables the firmware's compile-time policy
assertions. Passing native checks or compiling the sketch does not confirm
that a physical buzzer, LED or sensor has operated correctly.

For an ESP build, create a local `firmware/node_full/config.h` from
`config.example.h`, configure your own connection values and retain the whole
sketch folder. An absent `discovery_key.h` disables signed discovery and keeps
the configured broker IP fallback available; do not add a production key to
these tests or to Git.
