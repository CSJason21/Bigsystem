#!/usr/bin/env bash
#
# FL System 一键启动守护脚本
# 前后端以 nohup 后台守护进程方式运行，脚本退出后服务持续不掉。
#
# 用法:
#   ./start.sh           启动前后端
#   ./start.sh status    查看运行状态
#   ./start.sh stop      停止前后端
#   ./start.sh restart   重启
#
# 前端: http://localhost:10617
# 后端: http://localhost:10618

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$PROJECT_DIR/server"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

FRONT_PID_FILE="$LOG_DIR/frontend.pid"
BACK_PID_FILE="$LOG_DIR/backend.pid"
FRONT_LOG="$LOG_DIR/frontend.log"
BACK_LOG="$LOG_DIR/backend.log"

FRONT_PORT=10617
BACK_PORT=10618

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# 检测端口是否在监听
port_in_use() { ss -ltn "sport = :$1" 2>/dev/null | grep -q ":$1"; }

# 读取 PID 文件并检查进程是否存活
pid_alive() {
    local pid_file="$1"
    [ -f "$pid_file" ] || return 1
    local pid; pid="$(cat "$pid_file" 2>/dev/null)"
    [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# ---------- 加载 Node 20 ----------
load_node() {
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
        nvm use 20 >/dev/null 2>&1 || true
    fi
}

# ---------- 启动后端 ----------
start_backend() {
    if pid_alive "$BACK_PID_FILE" || port_in_use "$BACK_PORT"; then
        warn "后端已在运行 (端口 $BACK_PORT)，跳过"
        return 0
    fi
    info "启动后端 (uvicorn :$BACK_PORT)..."
    cd "$SERVER_DIR"
    [ -d venv ] && source venv/bin/activate
    nohup uvicorn app.main:app \
        --host 0.0.0.0 --port "$BACK_PORT" --reload \
        > "$BACK_LOG" 2>&1 &
    disown $! 2>/dev/null || true
    echo $! > "$BACK_PID_FILE"
    # 等待就绪
    for i in $(seq 1 30); do
        port_in_use "$BACK_PORT" && break
        sleep 1
    done
    if port_in_use "$BACK_PORT"; then
        info "后端已启动 -> http://localhost:$BACK_PORT  (PID $(cat "$BACK_PID_FILE"))"
    else
        error "后端启动失败，查看日志: $BACK_LOG"
        tail -n 20 "$BACK_LOG" 2>/dev/null || true
        return 1
    fi
}

# ---------- 启动前端 ----------
start_frontend() {
    if pid_alive "$FRONT_PID_FILE" || port_in_use "$FRONT_PORT"; then
        warn "前端已在运行 (端口 $FRONT_PORT)，跳过"
        return 0
    fi
    info "启动前端 (vite :$FRONT_PORT)..."
    cd "$PROJECT_DIR"
    load_node
    nohup npm run dev > "$FRONT_LOG" 2>&1 &
    disown $! 2>/dev/null || true
    echo $! > "$FRONT_PID_FILE"
    for i in $(seq 1 30); do
        port_in_use "$FRONT_PORT" && break
        sleep 1
    done
    if port_in_use "$FRONT_PORT"; then
        info "前端已启动 -> http://localhost:$FRONT_PORT  (PID $(cat "$FRONT_PID_FILE"))"
    else
        error "前端启动失败，查看日志: $BACK_LOG"
        tail -n 20 "$FRONT_LOG" 2>/dev/null || true
        return 1
    fi
}

# ---------- 停止 ----------
stop_proc() {
    local name="$1" pid_file="$2" port="$3"
    local stopped=false
    if pid_alive "$pid_file"; then
        local pid; pid="$(cat "$pid_file")"
        info "停止 $name (PID $pid)..."
        kill "$pid" 2>/dev/null || true
        for i in $(seq 1 10); do
            kill -0 "$pid" 2>/dev/null || break
            sleep 0.5
        done
        kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
        stopped=true
    fi
    # 兜底：按端口清理残留进程
    if port_in_use "$port"; then
        warn "$name 端口 $port 仍被占用，尝试按端口清理..."
        lsof -ti :"$port" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
        stopped=true
    fi
    rm -f "$pid_file"
    $stopped && info "$name 已停止" || warn "$name 未在运行"
}

stop_all() {
    stop_proc "后端" "$BACK_PID_FILE" "$BACK_PORT"
    stop_proc "前端" "$FRONT_PID_FILE" "$FRONT_PORT"
}

# ---------- 状态 ----------
show_status() {
    echo "============================================"
    echo " FL System 服务状态"
    echo "============================================"
    if pid_alive "$BACK_PID_FILE"; then
        echo -e " 后端  :$BACK_PORT  ${GREEN}● 运行中${NC}  PID $(cat "$BACK_PID_FILE")"
    elif port_in_use "$BACK_PORT"; then
        echo -e " 后端  :$BACK_PORT  ${YELLOW}● 端口占用 (PID 文件缺失)${NC}"
    else
        echo -e " 后端  :$BACK_PORT  ${RED}○ 未运行${NC}"
    fi
    if pid_alive "$FRONT_PID_FILE"; then
        echo -e " 前端  :$FRONT_PORT  ${GREEN}● 运行中${NC}  PID $(cat "$FRONT_PID_FILE")"
    elif port_in_use "$FRONT_PORT"; then
        echo -e " 前端  :$FRONT_PORT  ${YELLOW}● 端口占用 (PID 文件缺失)${NC}"
    else
        echo -e " 前端  :$FRONT_PORT  ${RED}○ 未运行${NC}"
    fi
    echo "============================================"
    echo " 前端日志: $FRONT_LOG"
    echo " 后端日志: $BACK_LOG"
    echo "============================================"
}

# ---------- 主入口 ----------
case "${1:-start}" in
    start)
        start_backend
        start_frontend
        echo
        show_status
        ;;
    stop)   stop_all ;;
    restart) stop_all; echo; start_backend; start_frontend; echo; show_status ;;
    status) show_status ;;
    *)
        echo "用法: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
