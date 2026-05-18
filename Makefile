.PHONY: setup lint analyze format generate

setup:
	@bash scripts/install-hooks.sh
	@echo "✅ 개발 환경 설정 완료"
	@echo "   필요한 툴: brew install swiftlint swiftformat xcodegen"

lint:
	swiftlint --config .swiftlint.yml

analyze:
	swiftlint analyze --config .swiftlint.yml --compiler-log-path compile_commands.json

format:
	swiftformat SwaggerMan SwaggerManTests --config .swiftformat

generate:
	xcodegen generate
