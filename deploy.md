# Инструкция по развертыванию uploading_my_sklad_inventory_by_warehouse_to_the_database

Пошаговая инструкция для развертывания скрипта выгрузки **остатков товаров по складам из МойСклад** на сервере Ubuntu 24.04 с FASTPANEL.

## Описание

Скрипт:
- Использует **МойСклад JSON API 1.2** (Report Stock By Store)
- Получает остатки товаров с детализацией по каждому складу
- Рассчитывает агрегированные итоги по товару (сумма по всем складам)
- Сохраняет данные в PostgreSQL с защитой от дубликатов (UPSERT)
- Ведёт технические логи выполнения в БД
- Запускается каждые 30 минут через cron

---

## API МойСклад

| Метод | Эндпоинт | Описание |
|-------|----------|----------|
| GET | `/entity/store` | Получить список всех складов |
| GET | `/report/stock/bystore` | Получить остатки с разбивкой по складам |

### Лимиты API МойСклад

| Ограничение | Значение |
|-------------|----------|
| Запросов за 5 секунд | Не более 100 |
| Параллельных запросов от пользователя | Не более 5 |
| Параллельных запросов от аккаунта | Не более 20 |
| Размер данных в запросе | Не более 10 МБ |

### Структура ответа `/report/stock/bystore`

```json
{
  "meta": {
    "href": "https://api.moysklad.ru/api/remap/1.2/report/stock/bystore",
    "type": "stockbystore",
    "size": 225,
    "limit": 1000,
    "offset": 0,
    "nextHref": "...?limit=1000&offset=1000"
  },
  "rows": [
    {
      "meta": {
        "href": "https://api.moysklad.ru/api/remap/1.2/entity/product/UUID",
        "type": "product"
      },
      "name": "Название товара",
      "code": "00001",
      "article": "ART-123",
      "stockByStore": [
        {
          "meta": {
            "href": "https://api.moysklad.ru/api/remap/1.2/entity/store/UUID",
            "type": "store"
          },
          "name": "Основной склад",
          "stock": 100,
          "reserve": 10,
          "inTransit": 5
        }
      ]
    }
  ]
}
```

### Поля остатков

| Поле | Описание |
|------|----------|
| `stock` | Остаток на складе |
| `reserve` | Зарезервировано |
| `inTransit` | В пути (ожидается поступление) |

---

## Требования

- Ubuntu 24.04
- Node.js 18.x или выше
- PostgreSQL (доступ к БД)
- API токен МойСклад

---

## Шаг 1: Подключение к серверу

### Через SSH:
```bash
ssh root@109.73.194.111
# Пароль: w8hDWrMybh6-bH
```

---

## Шаг 2: Проверка Node.js

```bash
node --version
# Ожидается: v18.19.1 или выше

npm --version
# Ожидается: 10.x или выше
```

Если Node.js не установлен:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt-get install -y nodejs
```

---

## Шаг 3: Копирование проекта на сервер

### Вариант A: Через SCP
```bash
scp -r uploading_my_sklad_inventory_by_warehouse_to_the_database root@109.73.194.111:/opt/
# Пароль: w8hDWrMybh6-bH
```

### Вариант B: Через SCP (архив)
```bash
scp uploading_my_sklad_inventory_by_warehouse_to_the_database.zip root@109.73.194.111:/opt/
ssh root@109.73.194.111
cd /opt
unzip uploading_my_sklad_inventory_by_warehouse_to_the_database.zip
```

### Вариант C: Через Git
```bash
cd /opt
git clone <URL_репозитория> uploading_my_sklad_inventory_by_warehouse_to_the_database
```

---

## Шаг 4: Установка зависимостей

```bash
cd /opt/uploading_my_sklad_inventory_by_warehouse_to_the_database
npm install
```

### Ожидаемый вывод:
```
added 2 packages in 2s
```

---

## Шаг 5: Настройка конфигурации (.env)

```bash
nano .env
```

Заполните `.env`:

```env
# МойСклад API
MS_TOKEN=38946db586067d35f5458aef5975969c16c01526
MS_BASE_URL=https://api.moysklad.ru/api/remap/1.2

# PostgreSQL Database
PG_HOST=176.124.219.60
PG_PORT=5432
PG_USER=gen_user
PG_PASSWORD=y>D4~;f^YLgFA|
PG_DATABASE=default_db

# Настройки запросов
REQUEST_LIMIT=1000
REQUEST_DELAY_MS=200
MAX_RETRIES=5
RETRY_BACKOFF_MS=2000
```

Сохраните: `Ctrl+X`, затем `Y`, затем `Enter`.

### Параметры конфигурации

| Параметр | Описание | По умолчанию |
|----------|----------|--------------|
| `MS_TOKEN` | Bearer-токен МойСклад | - |
| `MS_BASE_URL` | Базовый URL API | `https://api.moysklad.ru/api/remap/1.2` |
| `REQUEST_LIMIT` | Записей на страницу (макс. 1000) | `1000` |
| `REQUEST_DELAY_MS` | Задержка между запросами | `200` |
| `MAX_RETRIES` | Макс. повторов при ошибке | `5` |
| `RETRY_BACKOFF_MS` | Базовая задержка для backoff | `2000` |

---

## Шаг 6: Создание таблиц в БД

### Способ 1: Через npm скрипт
```bash
cd /opt/uploading_my_sklad_inventory_by_warehouse_to_the_database
npm run init-db
```

### Способ 2: Через psql
```bash
apt update && apt install -y postgresql-client
psql -h 176.124.219.60 -U gen_user -d default_db -f /opt/uploading_my_sklad_inventory_by_warehouse_to_the_database/sql/init.sql
# Введите пароль: y>D4~;f^YLgFA|
```

### Способ 3: Подключиться и выполнить вручную
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль

# В psql:
\i /opt/uploading_my_sklad_inventory_by_warehouse_to_the_database/sql/init.sql

# Проверьте создание таблиц:
\dt

# Должны появиться:
#  ms_stores
#  ms_snapshots
#  ms_stock_by_store
#  ms_stock_totals
#  ms_job_log

\q
```

### Структура таблиц

| Таблица | Назначение |
|---------|------------|
| `ms_stores` | Справочник складов МойСклад |
| `ms_snapshots` | Снимки синхронизации (timestamp каждой выгрузки) |
| `ms_stock_by_store` | Остатки по складам (детализация) |
| `ms_stock_totals` | Агрегированные остатки по товару (сумма по всем складам) |
| `ms_job_log` | Логи выполнения задач |

---

## Шаг 7: Тестовый запуск

```bash
cd /opt/uploading_my_sklad_inventory_by_warehouse_to_the_database
node src/app.js
```

### Ожидаемый вывод:

```
============================================================
MoySklad Sync started at 2025-02-03T12:00:00.000Z
============================================================
Database initialized
Fetching stores...
Found 5 stores
Created snapshot #1
Fetching stock by store...
Processed 5000 stock rows...
Processed 10000 stock rows...
Calculating totals for 1234 products...
Sync completed: 15000 stock rows, 1234 products, 5 stores
============================================================
Summary:
  Snapshot ID: 1
  Stores: 5
  Products: 1234
  Stock rows: 15000
============================================================
```

---

## Шаг 8: Настройка Cron (каждые 30 минут)

```bash
crontab -e
```

Добавьте строку:
```cron
*/30 * * * * cd /opt/uploading_my_sklad_inventory_by_warehouse_to_the_database && /usr/bin/node src/app.js >> /var/log/uploading_my_sklad_inventory_by_warehouse_to_the_database.log 2>&1
```

Сохраните и выйдите: `Ctrl+X`, затем `Y`, затем `Enter`.

### Проверка cron:
```bash
crontab -l
```

### Создание файла лога:
```bash
touch /var/log/uploading_my_sklad_inventory_by_warehouse_to_the_database.log
chmod 644 /var/log/uploading_my_sklad_inventory_by_warehouse_to_the_database.log
```

---

## Шаг 9: Проверка работы

### Просмотр логов в реальном времени:
```bash
tail -f /var/log/uploading_my_sklad_inventory_by_warehouse_to_the_database.log
```

### Проверка данных в БД:
```bash
psql -h 176.124.219.60 -U gen_user -d default_db
# Введите пароль: y>D4~;f^YLgFA|
```

```sql
-- Количество складов
SELECT COUNT(*) FROM ms_stores;

-- Список складов
SELECT id, name, external_code, archived, updated_at
FROM ms_stores
ORDER BY name;

-- Последние снимки синхронизации
SELECT id, collected_at, status, rows_processed, stores_synced
FROM ms_snapshots
ORDER BY collected_at DESC
LIMIT 10;

-- Остатки по складам (последний снимок)
SELECT 
    s.product_name, 
    st.name AS store_name, 
    s.stock, 
    s.reserve, 
    s.in_transit
FROM ms_stock_by_store s
JOIN ms_stores st ON s.store_id = st.id
WHERE s.snapshot_id = (SELECT MAX(id) FROM ms_snapshots WHERE status='completed')
ORDER BY s.stock DESC
LIMIT 20;

-- Агрегированные остатки по товарам (сумма по всем складам)
SELECT 
    product_name, 
    product_code, 
    product_article,
    total_stock, 
    total_reserve, 
    total_in_transit
FROM ms_stock_totals
WHERE snapshot_id = (SELECT MAX(id) FROM ms_snapshots WHERE status='completed')
ORDER BY total_stock DESC
LIMIT 20;

-- Статистика по складам
SELECT 
    st.name AS store_name,
    COUNT(*) AS products,
    SUM(s.stock) AS total_stock,
    SUM(s.reserve) AS total_reserve,
    SUM(s.in_transit) AS total_in_transit
FROM ms_stock_by_store s
JOIN ms_stores st ON s.store_id = st.id
WHERE s.snapshot_id = (SELECT MAX(id) FROM ms_snapshots WHERE status='completed')
GROUP BY st.name
ORDER BY total_stock DESC;

-- Логи выполнения
SELECT 
    job_start, 
    job_end, 
    status, 
    stores_count, 
    products_count, 
    stock_rows_count,
    http_requests,
    retries,
    EXTRACT(EPOCH FROM (job_end - job_start))::int AS duration_sec
FROM ms_job_log
ORDER BY job_start DESC
LIMIT 10;

-- Ошибки синхронизации
SELECT job_start, status, error_message
FROM ms_job_log
WHERE status = 'failed'
ORDER BY job_start DESC
LIMIT 5;

-- Товары с нулевыми остатками
SELECT product_name, product_code, total_stock
FROM ms_stock_totals
WHERE snapshot_id = (SELECT MAX(id) FROM ms_snapshots WHERE status='completed')
  AND total_stock = 0
LIMIT 20;
```

---

## Структура проекта

```
uploading_my_sklad_inventory_by_warehouse_to_the_database/
├── src/
│   ├── app.js                # Точка входа
│   ├── config.js             # Конфигурация из .env
│   ├── database.js           # Подключение к PostgreSQL
│   ├── api/
│   │   └── moysklad.js       # МойСклад JSON API 1.2
│   ├── services/
│   │   └── syncInventory.js  # Логика синхронизации
│   └── utils/
│       └── logger.js         # Логирование
├── sql/
│   └── init.sql              # SQL для создания таблиц
├── .env                      # Конфигурация (НЕ коммитить!)
├── .gitignore
├── package.json
└── deploy.md                 # Эта инструкция
```

---

## Устранение неполадок

### Ошибка подключения к БД

1. Проверьте доступность PostgreSQL:
   ```bash
   nc -zv 176.124.219.60 5432
   ```

2. Проверьте данные в `.env`

3. Проверьте whitelist IP в PostgreSQL (`pg_hba.conf`)

4. Тест подключения:
   ```bash
   psql -h 176.124.219.60 -U gen_user -d default_db -c "SELECT 1;"
   ```

### Ошибка API (401 Unauthorized)

1. Проверьте токен в `.env`
2. Убедитесь, что токен актуален (не истёк)
3. Проверьте формат: должен быть Bearer-токен

### Ошибка API (429 Too Many Requests)

Скрипт автоматически обрабатывает rate limiting с экспоненциальным backoff.
Если ошибка повторяется:
1. Увеличьте `REQUEST_DELAY_MS` в `.env`
2. Уменьшите `REQUEST_LIMIT` до 500

### Ошибка API (5xx Server Error)

Скрипт автоматически делает до 5 повторов с увеличивающейся задержкой.
Если проблема сохраняется — проверьте статус МойСклад.

### Cron не работает

1. Проверьте статус cron:
   ```bash
   systemctl status cron
   ```

2. Проверьте логи:
   ```bash
   grep CRON /var/log/syslog
   ```

3. Перезапустите cron:
   ```bash
   systemctl restart cron
   ```

4. Проверьте путь к node:
   ```bash
   which node
   # Должно быть: /usr/bin/node
   ```

### Долгое выполнение скрипта

При большом количестве товаров (>50000) синхронизация может занимать несколько минут.
Это нормально. Проверьте логи на наличие ошибок.

---

## Полезные команды

```bash
# Ручной запуск
cd /opt/uploading_my_sklad_inventory_by_warehouse_to_the_database && node src/app.js

# Просмотр последних логов
tail -100 /var/log/uploading_my_sklad_inventory_by_warehouse_to_the_database.log

# Статистика синхронизаций
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT status, COUNT(*), AVG(EXTRACT(EPOCH FROM (job_end - job_start)))::int as avg_sec,
          SUM(stock_rows_count) as total_rows
   FROM ms_job_log GROUP BY status;"

# Очистка старых снимков (старше 7 дней)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "DELETE FROM ms_snapshots WHERE collected_at < NOW() - INTERVAL '7 days';"

# Очистка старых логов (старше 30 дней)
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "DELETE FROM ms_job_log WHERE job_start < NOW() - INTERVAL '30 days';"

# Количество записей по таблицам
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT 'ms_stores' as table_name, COUNT(*) FROM ms_stores
   UNION ALL SELECT 'ms_snapshots', COUNT(*) FROM ms_snapshots
   UNION ALL SELECT 'ms_stock_by_store', COUNT(*) FROM ms_stock_by_store
   UNION ALL SELECT 'ms_stock_totals', COUNT(*) FROM ms_stock_totals
   UNION ALL SELECT 'ms_job_log', COUNT(*) FROM ms_job_log;"

# Топ-10 товаров по остаткам
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT product_name, total_stock FROM ms_stock_totals
   WHERE snapshot_id = (SELECT MAX(id) FROM ms_snapshots WHERE status='completed')
   ORDER BY total_stock DESC LIMIT 10;"

# Товары с отрицательными остатками
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT product_name, product_code, total_stock FROM ms_stock_totals
   WHERE snapshot_id = (SELECT MAX(id) FROM ms_snapshots WHERE status='completed')
     AND total_stock < 0;"
```

---

## Мониторинг

### Проверка последней успешной синхронизации
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT job_start, job_end, products_count, stock_rows_count
   FROM ms_job_log WHERE status = 'success'
   ORDER BY job_start DESC LIMIT 1;"
```

### Алерт если синхронизация не работает более 1 часа
```bash
psql -h 176.124.219.60 -U gen_user -d default_db -c \
  "SELECT CASE 
     WHEN MAX(job_start) < NOW() - INTERVAL '1 hour' THEN 'ALERT: No sync in last hour!'
     ELSE 'OK: Last sync at ' || MAX(job_start)::text
   END FROM ms_job_log WHERE status = 'success';"
```

---