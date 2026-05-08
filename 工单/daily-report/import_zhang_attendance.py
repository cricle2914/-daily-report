"""为张宏洋生成2026年全年考勤数据"""
import subprocess
from datetime import datetime, date, timedelta

ENGINEER_ID = 2  # 张宏洋
ENGINEER_NAME = '张宏洋'
YEAR = 2026

def run_sql(sql):
    result = subprocess.run(
        f'kubectl exec mysql-0 -n daily-report -- mysql -u reporter -preporter123 daily_report --default-character-set=utf8mb4 -e "{sql}"',
        shell=True, capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0 and 'Duplicate' not in result.stderr:
        print(f'  SQL错误: {result.stderr[:200]}')
        return None
    return result.stdout

# ====== 1. 关联张宏洋到所有项目 ======
print('===== 1. 关联张宏洋到所有项目 =====')
result = run_sql(
    "INSERT IGNORE INTO engineer_projects (engineer_id, project_id, impl_days) "
    "SELECT 2, ep.project_id, 0 FROM engineer_projects ep WHERE ep.engineer_id = 1 AND ep.project_id NOT IN (SELECT project_id FROM engineer_projects WHERE engineer_id = 2);"
)
# 查一下关联结果
result = run_sql(
    "SELECT COUNT(*) AS cnt FROM engineer_projects WHERE engineer_id = 2;"
)
print(result)

# ====== 2. 生成全年考勤数据 ======
print('\n===== 2. 生成全年考勤数据 =====')

# 先查询张宏洋已关联的项目ID列表
result = run_sql(
    "SELECT GROUP_CONCAT(project_id) FROM engineer_projects WHERE engineer_id = 2;"
)
proj_ids = [int(x) for x in result.strip().split('\n')[-1].strip().split(',') if x.strip().isdigit()]
print(f'张宏洋关联的项目ID: {proj_ids}')

# 获取第一个项目的ID作为默认项目
default_project_id = proj_ids[0] if proj_ids else 1

# 逐月生成 SQL
sql_lines = ['SET NAMES utf8mb4;', 'START TRANSACTION;']

start_date = date(YEAR, 1, 1)
end_date = date(YEAR, 12, 31)
current = start_date
total_days = 0

while current <= end_date:
    dow = current.weekday()  # 0=Mon, 6=Sun
    date_str = current.isoformat()

    if dow <= 4:  # 周一到周五
        if dow <= 1:  # 周一(0)、周二(1) → 外勤 → 已有项目
            destination = 'existing_project'
            other_reason = None
        elif dow <= 3:  # 周三(2)、周四(3) → 回公司
            destination = 'back_to_office'
            other_reason = None
        else:  # 周五(4) → 请假
            destination = 'other'
            other_reason = '请假'

        if other_reason:
            sql_lines.append(
                f"INSERT IGNORE INTO tomorrow_plans "
                f"(engineer_id, report_date, destination, project_id, other_reason) VALUES "
                f"({ENGINEER_ID}, '{date_str}', '{destination}', {default_project_id}, '{other_reason}');"
            )
        else:
            sql_lines.append(
                f"INSERT IGNORE INTO tomorrow_plans "
                f"(engineer_id, report_date, destination, project_id) VALUES "
                f"({ENGINEER_ID}, '{date_str}', '{destination}', {default_project_id});"
            )
        total_days += 1
    # weekend: skip

    current += timedelta(days=1)

sql_lines.append('COMMIT;')

print(f'共生成 {total_days} 条考勤记录')

# 写入 SQL 文件
sql_path = r'C:\Users\2914\Desktop\工单\daily-report\import_zhang_attendance.sql'
with open(sql_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))

# 执行 SQL
print('\n===== 开始导入 =====')
result = subprocess.run(
    f'kubectl exec -i mysql-0 -n daily-report -- mysql -u reporter -preporter123 daily_report --default-character-set=utf8mb4 < "{sql_path}"',
    shell=True, capture_output=True, text=True, timeout=120
)

if result.returncode == 0:
    print('导入成功！')
else:
    print(f'导入错误: {result.stderr[:500]}')

# 验证
print('\n===== 验证 =====')
verify = run_sql(
    "SELECT p.name AS pname, COUNT(tp.id) AS days "
    "FROM tomorrow_plans tp JOIN projects p ON tp.project_id = p.id "
    "WHERE tp.engineer_id = 2 AND tp.report_date LIKE '2026%' "
    "GROUP BY tp.destination, p.id ORDER BY days DESC LIMIT 10;"
)
print(verify)
