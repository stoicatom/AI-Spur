#!/bin/bash
#
# AISpur 安装助手 — 解除 macOS 隔离标记
#
# 为什么需要这一步：AISpur 是开源软件，没有购买 Apple 的付费开发者签名
# （每年 $99）。macOS 会给所有从网络下载的未签名应用打上 "quarantine"
# （隔离）标记，并显示「已损坏，无法打开」——这个提示是误导性的，应用
# 本身完好，只是缺少 Apple 的付费签名背书。
#
# 这个脚本做的唯一一件事：移除那个隔离标记。它不修改应用内容、不联网、
# 不收集任何信息。全部源码可见（就是你正在读的这个文件）。
#

set -euo pipefail

# 颜色输出
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
DIM='\033[2m'
RESET='\033[0m'

# 这个脚本自己也可能被隔离，先自解除，避免"脚本无法运行"的死循环
SELF_PATH="${BASH_SOURCE[0]}"
if xattr -p com.apple.quarantine "$SELF_PATH" >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "$SELF_PATH" 2>/dev/null || true
fi

clear
printf "${BOLD}AISpur 安装助手${RESET}\n"
printf "${DIM}────────────────────────────────────────────────${RESET}\n\n"

# 定位应用：优先 /Applications，其次用户目录，最后同目录
APP_NAME="AISpur.app"
CANDIDATES=(
  "/Applications/$APP_NAME"
  "$HOME/Applications/$APP_NAME"
  "$(cd "$(dirname "$SELF_PATH")" && pwd)/$APP_NAME"
)

APP_PATH=""
for candidate in "${CANDIDATES[@]}"; do
  if [ -d "$candidate" ]; then
    APP_PATH="$candidate"
    break
  fi
done

if [ -z "$APP_PATH" ]; then
  printf "${RED}没有找到 AISpur.app${RESET}\n\n"
  printf "请先把 AISpur 拖进「应用程序」文件夹，然后重新运行这个脚本。\n\n"
  printf "${DIM}（已查找：/Applications、~/Applications、脚本所在目录）${RESET}\n\n"
  printf "按回车键关闭…"
  read -r
  exit 1
fi

printf "找到应用：${BOLD}%s${RESET}\n\n" "$APP_PATH"

# 检查是否真的需要处理
if ! xattr -p com.apple.quarantine "$APP_PATH" >/dev/null 2>&1; then
  printf "${GREEN}这个应用已经可以正常打开了${RESET} — 无需任何处理。\n\n"
  printf "如果双击仍然报错，可能是别的原因（例如系统版本过低，\n"
  printf "AISpur 需要 macOS 10.15 或更高）。\n\n"
  printf "按回车键关闭…"
  read -r
  exit 0
fi

printf "${YELLOW}检测到 macOS 隔离标记${RESET} — 这就是「已损坏」提示的来源。\n\n"

printf "${BOLD}将要执行的操作：${RESET}\n"
printf "  移除 AISpur.app 的 com.apple.quarantine 标记\n\n"

printf "${BOLD}这个操作：${RESET}\n"
printf "  ${GREEN}✓${RESET} 不会修改应用的任何代码或数据\n"
printf "  ${GREEN}✓${RESET} 不联网、不上传、不收集信息\n"
printf "  ${GREEN}✓${RESET} 只影响 AISpur 这一个应用，不改变系统安全设置\n"
printf "  ${GREEN}✓${RESET} 完全可逆（见下方说明）\n\n"

printf "${DIM}为什么需要管理员密码：隔离标记是受系统保护的文件属性，\n"
printf "修改它需要管理员权限。这是 macOS 的设计，不是 AISpur 的要求。${RESET}\n\n"

printf "${DIM}想自己动手？等效的单条命令是：\n"
printf "  sudo xattr -r -d com.apple.quarantine \"%s\"${RESET}\n\n" "$APP_PATH"

printf "继续吗？[y/N] "
read -r reply
case "$reply" in
  [yY] | [yY][eE][sS]) ;;
  *)
    printf "\n已取消，未做任何改动。\n\n"
    printf "按回车键关闭…"
    read -r
    exit 0
    ;;
esac

printf "\n${DIM}请输入你的 Mac 登录密码（输入时不会显示字符）：${RESET}\n"

if sudo xattr -r -d com.apple.quarantine "$APP_PATH"; then
  printf "\n${GREEN}${BOLD}完成${RESET}\n\n"
  printf "AISpur 现在可以正常打开了。\n\n"

  printf "${BOLD}接下来：${RESET}\n"
  printf "  1. 打开 AISpur（在「应用程序」里双击，或用启动台）\n"
  printf "  2. 首次运行时，系统会请求${BOLD}辅助功能${RESET}权限\n"
  printf "     ${DIM}AISpur 需要它来向终端发送按键（这是核心功能：\n"
  printf "     甩鞭后自动发送 Esc + 催促词 + 回车）${RESET}\n"
  printf "  3. 在「系统设置 → 隐私与安全性 → 辅助功能」中勾选 AISpur\n\n"

  printf "${DIM}想撤销这次操作？运行：\n"
  printf "  sudo xattr -w com.apple.quarantine \\\\\n"
  printf "    \"0081;00000000;;\" \"%s\"${RESET}\n\n" "$APP_PATH"

  printf "${DIM}想彻底避免这类提示？请开发者购买 Apple 开发者账号并对应用\n"
  printf "公证（notarize）。这是唯一的根本解法，也是本脚本存在的原因。${RESET}\n\n"
else
  printf "\n${RED}操作失败${RESET}\n\n"
  printf "可能的原因：\n"
  printf "  • 密码输入错误或超时\n"
  printf "  • 当前用户不是管理员\n"
  printf "  • 应用正在运行（请先退出 AISpur 再试）\n\n"
  printf "你也可以手动在终端运行：\n"
  printf "  ${BOLD}sudo xattr -r -d com.apple.quarantine \"%s\"${RESET}\n\n" "$APP_PATH"
fi

printf "按回车键关闭…"
read -r
