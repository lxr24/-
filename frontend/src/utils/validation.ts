// 邮箱校验函数
function checkEmail(emailString: string): boolean {
  // 包含且只有一个 @
  const atCount = emailString.split('@').length - 1;
  if (atCount !== 1) return false;

  const [localPart, domain] = emailString.split('@');
  // 前缀和域名不能为空
  if (!localPart || !domain) return false;

  // 域名必须包含一个 . 且不在首尾
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;

  // 域名最后一段至少 2 位
  const domainParts = domain.split('.');
  const topDomain = domainParts[domainParts.length - 1];
  if (topDomain.length < 2) return false;

  return true;
}

// 手机号校验函数
function checkPhone(phoneNum: string): boolean {
  if (phoneNum.length !== 11) return false;
  for (const char of phoneNum) {
    if (char < '0' || char > '9') return false;
  }

  if (phoneNum[0] !== '1') return false;

  // 第二位必须是 3、4、5、6、7、8、9
  const second = phoneNum[1];
  if (!['3', '4', '5', '6', '7', '8', '9'].includes(second)) return false;
  return true;
}

// 密码校验函数, 少于6位返回1，不同时包含字母和数字返回2，合法返回0
function checkPassword(password: string): number {
  // 密码长度至少 6 位
  if (password.length < 6) {
    return 1;
  }

  let hasLetter = false;
  let hasNumber = false;

  // 遍历每个字符，判断是否有字母和数字
  for (const c of password) {
    // 判断是否为字母
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      hasLetter = true;
    }
    // 判断是否为数字
    if (c >= '0' && c <= '9') {
      hasNumber = true;
    }
  }

  // 必须同时包含字母 + 数字
  if (!hasLetter || !hasNumber) {
    return 2;
  }
  return 0;
}

export { checkEmail, checkPhone, checkPassword };