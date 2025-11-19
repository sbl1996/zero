## Monster Editor Backend

### Setup

```bash
cd editor/backend
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.application:app --reload
```

### Tests

```bash
cd editor/backend
source .venv/bin/activate
pytest
```
