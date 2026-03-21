import { getRequestConfig } from "next-intl/server";

export default getRequestConfig(async () => {
  // Single locale for now — expand when multi-language support is needed
  const locale = "en";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
