# micro-web 常用命令（S0-02）
# 用法：make <target>；workspace 骨架于 S3 落地（pnpm-workspace.yaml + apps/*）
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

.DEFAULT_GOAL := help
.PHONY: install lint typecheck build dev clean help

## install: pnpm install（有 lockfile 时 --frozen-lockfile）
install:
ifeq ($(wildcard pnpm-lock.yaml),)
	pnpm install
else
	pnpm install --frozen-lockfile
endif

## lint: oxlint（CI 同款）
lint:
	pnpm -r lint

## typecheck: tsc --noEmit（CI 同款）
typecheck:
	pnpm -r typecheck

## build: 全 workspace 构建（CI 同款）
build:
	pnpm -r build

## dev: 本地启动（示例：make dev app=admin）
dev:
	@test -n "$(app)" || { echo "用法：make dev app=admin|dealer|station|..."; exit 1; }
	pnpm --filter $(app) dev

## clean: 清理构建产物与依赖
clean:
	rm -rf node_modules apps/*/node_modules apps-miniapp/*/node_modules apps-mobile/*/node_modules packages/*/node_modules
	rm -rf apps/*/dist apps-miniapp/*/dist apps-mobile/*/dist packages/*/dist

## help: 目标清单
help:
	@echo "install / lint / typecheck / build / dev app=x / clean"
