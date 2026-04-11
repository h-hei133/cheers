import os
import re
from pathlib import Path


def validate_schema_version(version: str) -> bool:
    pattern = r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$"
    return bool(re.match(pattern, version))


class TestPythonEvalSmoke:
    def test_contract_schema_exists(self) -> None:
        repo_root = Path(__file__).resolve().parents[3]
        assert (repo_root / "contracts" / "runtime-protocol.schema.json").exists()

    def test_valid_schema_versions(self) -> None:
        assert validate_schema_version("0.1.0")
        assert validate_schema_version("1.0.0")
        assert validate_schema_version("1.2.3")
        assert validate_schema_version("1.0.0-alpha")
        assert validate_schema_version("1.0.0+build.1")

    def test_invalid_schema_versions(self) -> None:
        assert not validate_schema_version("1")
        assert not validate_schema_version("1.0")
        assert not validate_schema_version("v1.0.0")
        assert not validate_schema_version("1.0.0.0")

    def test_python_smoke_initialization(self) -> None:
        assert os.environ.get("PRIVATE_AGENTS_FAIL_PYTHON_SMOKE") != "1"
