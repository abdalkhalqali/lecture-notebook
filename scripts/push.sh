#!/bin/bash
# رفع التحديثات إلى GitHub باستخدام الرمز المميز المخزن في المتغيرات البيئية

set -e

if [ -z "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
  echo "❌ خطأ: GITHUB_PERSONAL_ACCESS_TOKEN غير موجود في المتغيرات البيئية"
  exit 1
fi

REPO_URL="https://${GITHUB_PERSONAL_ACCESS_TOKEN}@github.com/abdalkhalqali/lecture-notebook.git"

COMMIT_MSG="${1:-تحديث تلقائي - $(date '+%Y-%m-%d %H:%M')}"

echo "🔓 تنظيف ملفات القفل إن وُجدت..."
rm -f .git/index.lock .git/MERGE_HEAD .git/CHERRY_PICK_HEAD 2>/dev/null || true

echo "📦 إضافة الملفات المعدّلة..."
git add -A

if git diff --cached --quiet; then
  echo "✅ لا توجد تغييرات للرفع"
  exit 0
fi

echo "💾 حفظ التغييرات: $COMMIT_MSG"
git -c user.email="bot@replit.com" -c user.name="Replit Bot" commit -m "$COMMIT_MSG"

echo "🚀 رفع التحديثات إلى GitHub..."
git push "$REPO_URL" HEAD:main

echo "✅ تم الرفع بنجاح!"
