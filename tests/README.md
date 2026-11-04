# Kiểm thử firmware P1

Các mục dưới đây gồm biên dịch sketch, kịch bản phần cứng và kiểm tra native C++. Kết quả phần mềm không xác nhận mọi bài thử vật lý đã đạt trên hai node. Xem [TEST_STATUS](../docs/TEST_STATUS.md) để phân biệt các mốc kết quả và phần nghiệm thu còn chờ.

## Kiểm tra tại thời điểm biên dịch

`alarm_policy.h` có 25 kiểm tra chính sách/ngưỡng; `flame_monitor.h` có 6 chuỗi kiểm tra nguồn/DO. Chúng chỉ được đánh giá khi bật `ALARM_POLICY_SELF_TEST`.

Sau khi tạo `firmware/node_full/config.h` từ file mẫu, có thể dùng Arduino CLI đã cài sẵn:

```powershell
arduino-cli compile --fqbn esp8266:esp8266:nodemcuv2 --build-property "compiler.cpp.extra_flags=-DALARM_POLICY_SELF_TEST" firmware/node_full
```

Lệnh trên chỉ biên dịch, không nạp hay tác động thiết bị. Nếu CLI không nằm trong PATH, dùng đường dẫn cài Arduino CLI của máy. Thư viện/core hiện tại xem [README](../README.md#board-và-thư-viện). Mặc định là LAN; để build chế độ cloud, cấu hình `MQTT_USE_TLS=1`, hostname/cổng TLS và `mqtt_ca.h` theo [CLOUD_MQTT](../docs/CLOUD_MQTT.md). Cấu hình TLS thiếu CA vẫn biên dịch được nhưng không bật kết nối mạng cloud khi chạy.

## Ba sketch thử riêng

| Thư mục | Mục đích và cách chuẩn bị |
|---|---|
| `tests/firmware/usb_stability_test/` | Chỉ ESP với USB, tháo cảm biến khi đã ngắt nguồn; Serial có `ESP OK` tăng đều |
| `tests/firmware/ds18b20_test/` | DS DATA=D2, 4,7k kéo lên 3V3; hiển thị số đo để kiểm tra bước đầu |
| `tests/firmware/mq2_test/` | MQ AO qua 47k/10k vào A0; chỉ in ADC thô, không ppm |

Mỗi sketch có `.ino` cùng tên thư mục, mở riêng trong Arduino IDE. Serial 115200. Nạp sketch thử sẽ thay firmware tổng trên ESP. DS sketch đơn giản có thể hiển thị giá trị khởi tạo mà firmware tổng sẽ kiểm tra kỹ hơn; không dùng nó để bỏ qua các health/CRC/nguồn của firmware tổng.

Các bản thử còi nghỉ LOW và RGB ba màu/D0 cũ không được đóng gói vì khác cấu hình V6 hiện tại: còi đang đặt nghỉ HIGH, D0 dành riêng cho Flame và RGB B để trống. Kiểm tra còi/RGB theo các ca trong `hardware-test-cases.md` với firmware tổng; không nạp nhầm code làm D0 thành OUTPUT khi vẫn nối Flame.

## Kiểm thử trên mạch

Thực hiện và ghi lại `hardware-test-cases.md` cho từng node. Khi chưa thực hiện, giữ kết quả là **Chưa thử**; không tự ghi Đạt dựa trên mô phỏng hay biên dịch. Không tạo lửa/rò khí để thử. Kiểm tra ngưỡng/ưu tiên bằng các bộ kiểm tra phần mềm; mọi thay đổi dây đều làm khi đã rút mọi nguồn.

## Kết quả lịch sử khi chuẩn bị gói ngày 26/10/2026

Các ghi nhận này thuộc bản P1 tại mốc đó; không phải kết quả chạy lại trên firmware hiện tại. Dùng [hợp đồng MQTT hiện tại](../docs/MQTT_CONTRACT.md) và [JSON mẫu mới](../examples/README.md) khi tích hợp. Các mốc kiểm tra/build ngày 04/11 nằm trong [TEST_STATUS](../docs/TEST_STATUS.md).

- Đã sao chép cấu hình mẫu của chính gói này thành `config.h` trong thư mục biên dịch tạm, biên dịch firmware tổng với `ALARM_POLICY_SELF_TEST`: đạt cả 31 kiểm tra tại thời điểm biên dịch. Không nạp vào ESP.
- Ba JSON mô phỏng trong `docs/telemetry-examples/` đã qua validator schema6 của bộ backend thử nghiệm hiện có. Chúng không được gửi vào broker/database vận hành.
- Ba sketch thử riêng được giữ nguyên từ mã nguồn trước đó; chưa biên dịch lại cả ba hoặc kiểm tra lại trên hai board trong lần đóng gói này.
- Đã đối chiếu mã firmware tổng với nguồn V6, kiểm tra cấu hình mẫu và danh sách file: gói không có `config.h` thật, database, `.bak` hoặc log vận hành. Kết quả phần cứng vẫn chờ theo bảng kịch bản.

## Native C++ checks

These tests exercise the firmware's actual parsers, timer/output policy,
threshold record validation and persistence recovery. The filesystem/ESP stubs
operate in memory. No backend source, MQTT broker, ESP or physical output is
used by these checks.

Run commands from the repository root. The remote-threshold and remote-action
suites require these dependencies:

- A C++17 compiler such as GCC or Clang.
- The ArduinoJson **6.21.5** source headers; set the include path to its `src`
  directory. ArduinoJson 7 is not the version used for these checks.
- OpenSSL development headers and `libcrypto`, required by the discovery HMAC
  test. The test verifies public fixtures with an independent HMAC provider;
  the ESP build uses BearSSL supplied by its ESP8266 core.

The hexadecimal HMAC key, request IDs and IP addresses in the test source are
public test fixtures. They are not production discovery keys or connection
credentials.

`firmware_mqtt_cloud_policy.cpp` is a separate pure C++17 suite with 31
hostname/time-readiness checks. It requires no ArduinoJson, OpenSSL, broker or
ESP. It does not test DNS, a TLS handshake, certificates or network latency.

### Linux/macOS or a compatible shell

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

g++ -std=c++17 -Wall -Wextra -Werror \
  tests/firmware_mqtt_cloud_policy.cpp \
  -o "$NATIVE_OUTPUT/firmware_mqtt_cloud_policy"

"$NATIVE_OUTPUT/firmware_remote_thresholds"
"$NATIVE_OUTPUT/firmware_remote_actions"
"$NATIVE_OUTPUT/firmware_mqtt_cloud_policy"
```

### Windows PowerShell

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
g++ -std=c++17 -Wall -Wextra -Werror tests/firmware_mqtt_cloud_policy.cpp -o "$nativeOutput/firmware_mqtt_cloud_policy.exe"

& "$nativeOutput/firmware_remote_thresholds.exe"
& "$nativeOutput/firmware_remote_actions.exe"
& "$nativeOutput/firmware_mqtt_cloud_policy.exe"
```

Each executable prints a `PASS` line and exits successfully when its checks
pass. `ALARM_POLICY_SELF_TEST` also enables the firmware's compile-time policy
assertions. Passing native checks or compiling the sketch does not confirm
that a physical buzzer, LED or sensor has operated correctly.

For an ESP build, create a local `firmware/node_full/config.h` from
`config.example.h`, configure your own connection values and retain the whole
sketch folder. In default LAN mode, an absent `discovery_key.h` disables signed
discovery and keeps the configured broker IPv4 fallback available. Cloud TLS
mode uses the configured hostname and provider CA in a local `mqtt_ca.h`;
signed LAN discovery is disabled. Do not add production keys or credentials
to these tests or Git. See [CLOUD_MQTT](../docs/CLOUD_MQTT.md) for setup.

Native passes and ESP compilation do not confirm that cloud service creation,
flashing, certificate rejection or physical operation has been tested. The
synchronous DNS/TCP/TLS connection can delay sampling; runtime latency, heap
during reconnect and live certificate-failure behavior remain to be measured.
Build variants and exact evidence limits are recorded in
[TEST_STATUS](../docs/TEST_STATUS.md#bổ-sung-cloud-mqtt-tls--04112026).
