# @lite-fsm/entities — performance report

Дата локального замера: 2026-06-14  
Benchmark: `composition-lite-fsm-entities`  
Runtime path: production `dist` entrypoints `@lite-fsm/core` и `@lite-fsm/entities`.

## Методика

Команды:

```bash
pnpm run bench:entities
pnpm run bench:entities:browser
```

Каждый scenario выполняет `5` warmup iterations и `30` measured iterations.
Output фиксирует median и p95. Hard gate использует только median:

- reducer-only `TICK`: не медленнее `1.5x` hand-written SoA ECS baseline;
- full pipeline без renderer calls: не медленнее `2x` hand-written SoA ECS baseline.

`p95` не является hard gate. Node profile дополнительно проверяет steady-state
`TICK` allocation guard: отсутствие retained heap growth, растущего per row.

## Node.js profile

Статус: `fail`. Allocation guard: `pass`, retained growth `0 bytes`, per-row
growth `0.000 bytes/row`.

| Scenario | Rows | Gate | SoA median | SoA p95 | entities median | entities p95 | Ratio | Budget | Status |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| movement update | 10,000 | reducer-only | 0.030ms | 0.033ms | 0.234ms | 0.368ms | 7.68x | 1.50x | fail |
| movement update | 50,000 | reducer-only | 0.239ms | 0.270ms | 1.149ms | 1.689ms | 4.80x | 1.50x | fail |
| projectile lifetime update | 10,000 | reducer-only | 0.023ms | 0.056ms | 0.192ms | 0.236ms | 8.31x | 1.50x | fail |
| projectile lifetime update | 50,000 | reducer-only | 0.180ms | 0.236ms | 0.970ms | 1.675ms | 5.38x | 1.50x | fail |
| `despawnOn` cleanup | 10,000 | full-pipeline | 0.029ms | 0.030ms | 2.311ms | 2.546ms | 79.53x | 2.00x | fail |
| `despawnOn` cleanup | 50,000 | full-pipeline | 0.276ms | 0.289ms | 9.244ms | 10.378ms | 33.51x | 2.00x | fail |
| sprite sync reaction | 10,000 | full-pipeline | 0.048ms | 0.108ms | 1.524ms | 1.932ms | 31.56x | 2.00x | fail |
| sprite sync reaction | 50,000 | full-pipeline | 0.335ms | 0.444ms | 9.012ms | 10.525ms | 26.92x | 2.00x | fail |

## Browser profile

Статус: `fail`. Allocation guard: skipped, потому что browser profile не
предоставляет explicit GC и portable heap usage API.

| Scenario | Rows | Gate | SoA median | SoA p95 | entities median | entities p95 | Ratio | Budget | Status |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| movement update | 10,000 | reducer-only | 0.030ms | 0.040ms | 0.200ms | 0.300ms | 6.67x | 1.50x | fail |
| movement update | 50,000 | reducer-only | 0.320ms | 0.340ms | 1.020ms | 1.040ms | 3.19x | 1.50x | fail |
| projectile lifetime update | 10,000 | reducer-only | 0.020ms | 0.040ms | 0.180ms | 0.220ms | 9.00x | 1.50x | fail |
| projectile lifetime update | 50,000 | reducer-only | 0.240ms | 0.260ms | 0.940ms | 1.000ms | 3.92x | 1.50x | fail |
| `despawnOn` cleanup | 10,000 | full-pipeline | 0.040ms | 0.060ms | 2.800ms | 2.880ms | 70.00x | 2.00x | fail |
| `despawnOn` cleanup | 50,000 | full-pipeline | 0.300ms | 0.360ms | 8.940ms | 9.020ms | 29.80x | 2.00x | fail |
| sprite sync reaction | 10,000 | full-pipeline | 0.050ms | 0.100ms | 1.440ms | 2.060ms | 28.80x | 2.00x | fail |
| sprite sync reaction | 50,000 | full-pipeline | 0.500ms | 0.520ms | 7.340ms | 7.780ms | 14.68x | 2.00x | fail |

## Вывод

Benchmark infrastructure готова и показывает p95 для каждого scenario, но
текущий entity runtime не проходит median ratio budgets из ТЗ. Эти failures
приняты пользователем как deferred performance work и не скрываются изменением
thresholds или статусов строк. До строгого release gate нужен отдельный этап
оптимизации runtime hot path.
