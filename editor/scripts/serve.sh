#!/bin/bash

set -euo pipefail

# --- 路径与配置 ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/../backend" && pwd)"
VENV_BIN="${BACKEND_DIR}/.venv/bin"
UVICORN_BIN="${VENV_BIN}/uvicorn"
APP_MODULE="app.application:app"
BIND_HOST="${BIND_HOST:-0.0.0.0}"
DEFAULT_PORT="8000"
ACTION="${1:-}"
PORT="${2:-$DEFAULT_PORT}"
PID_FILE="${BACKEND_DIR}/uvicorn_${PORT}.pid"
LOG_FILE="${BACKEND_DIR}/uvicorn_${PORT}.log"

if [[ -z "${ACTION}" ]]; then
  echo "Usage: $0 {start|stop|restart|status} [port]"
  exit 1
fi

ensure_uvicorn() {
  if [[ ! -x "${UVICORN_BIN}" ]]; then
    echo "Cannot find uvicorn at ${UVICORN_BIN}"
    echo "Activate editor/backend/.venv and install backend dependencies first."
    exit 1
  fi
}

is_running() {
  if [[ -f "${PID_FILE}" ]]; then
    local pid
    pid=$(cat "${PID_FILE}")
    if ps -p "${pid}" > /dev/null 2>&1; then
      return 0
    fi
  fi

  if pgrep -f "${UVICORN_BIN}.*--port[[:space:]]+${PORT}" > /dev/null; then
    return 0
  fi
  return 1
}

start() {
  ensure_uvicorn
  if is_running; then
    echo "Uvicorn already running on port ${PORT}."
    return 0
  fi

  echo "Starting Uvicorn on port ${PORT}..."
  (
    cd "${BACKEND_DIR}"
    nohup "${UVICORN_BIN}" "${APP_MODULE}" \
      --host "${BIND_HOST}" \
      --port "${PORT}" \
      > "${LOG_FILE}" 2>&1 &
    echo $! > "${PID_FILE}"
  )

  sleep 1
  if is_running; then
    echo "Uvicorn started (PID $(cat "${PID_FILE}")). Logs: ${LOG_FILE}"
  else
    echo "Failed to start Uvicorn. Check ${LOG_FILE}"
    rm -f "${PID_FILE}"
    exit 1
  fi
}

stop() {
  if ! is_running; then
    echo "Uvicorn is not running on port ${PORT}."
    rm -f "${PID_FILE}"
    return 0
  fi

  local pid
  if [[ -f "${PID_FILE}" ]]; then
    pid=$(cat "${PID_FILE}")
  else
    pid=$(pgrep -f "${UVICORN_BIN}.*--port[[:space:]]+${PORT}" | head -n1)
  fi

  if [[ -n "${pid:-}" ]]; then
    echo "Stopping Uvicorn (PID ${pid}) on port ${PORT}..."
    kill "${pid}" >/dev/null 2>&1 || true
    sleep 1
    if ps -p "${pid}" > /dev/null 2>&1; then
      echo "Force killing PID ${pid}..."
      kill -9 "${pid}" >/dev/null 2>&1 || true
    fi
  fi

  rm -f "${PID_FILE}"
  echo "Uvicorn stopped."
}

status_port() {
  if is_running; then
    echo "Uvicorn RUNNING on port ${PORT}."
    if [[ -f "${PID_FILE}" ]]; then
      ps -p "$(cat "${PID_FILE}")"
    else
      pgrep -af "${UVICORN_BIN}.*--port[[:space:]]+${PORT}"
    fi
  else
    echo "Uvicorn NOT running on port ${PORT}."
  fi
}

status_all() {
  ensure_uvicorn
  local matches
  matches=$(pgrep -af "${UVICORN_BIN}.*${APP_MODULE}" || true)
  if [[ -z "${matches}" ]]; then
    echo "No running Uvicorn instances for ${APP_MODULE}."
    return
  fi

  echo "Active Uvicorn instances:"
  echo "PORT     PID"
  echo "---------------"
  while IFS= read -r line; do
    local pid port
    pid=$(echo "${line}" | awk '{print $1}')
    if [[ "${line}" =~ --port[[:space:]]+([0-9]+) ]]; then
      port="${BASH_REMATCH[1]}"
      printf "%-8s %s\n" "${port}" "${pid}"
    fi
  done <<< "${matches}"
}

case "${ACTION}" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    stop
    start
    ;;
  status)
    if [[ -n "${2:-}" ]]; then
      PORT="$2"
      PID_FILE="${BACKEND_DIR}/uvicorn_${PORT}.pid"
      LOG_FILE="${BACKEND_DIR}/uvicorn_${PORT}.log"
      status_port
    else
      status_all
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|status} [port]"
    exit 1
    ;;
esac
