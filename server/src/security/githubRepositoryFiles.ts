export type SelectedRepositoryFile = { path: string };

export type RepositoryFileContent = { path: string; content: string };

type GitHubContentsResponse = {
  type?: string;
  encoding?: string;
  content?: unknown;
};

type FetchLike = typeof fetch;

/**
 * Fetch all selected source files or fail the whole analysis.
 *
 * Returning empty strings for failed GitHub requests made the AI analysis look
 * successful while silently omitting source. This helper treats any missing,
 * malformed, or unsupported file payload as an incomplete repository snapshot.
 */
export async function fetchSelectedRepositoryFiles(
  repository: string,
  defaultBranch: string,
  selected: SelectedRepositoryFile[],
  headers: HeadersInit,
  fetchImpl: FetchLike = fetch,
): Promise<RepositoryFileContent[]> {
  return Promise.all(selected.map(async (file) => {
    const encodedPath = file.path.split("/").map(encodeURIComponent).join("/");
    const url = `https://api.github.com/repos/${repository}/contents/${encodedPath}?ref=${encodeURIComponent(defaultBranch)}`;
    const response = await fetchImpl(url, { headers });
    if (!response.ok) {
      throw new Error(`Failed to fetch repository file "${file.path}" (HTTP ${response.status}); analysis aborted to avoid using incomplete source.`);
    }

    const data = await response.json() as GitHubContentsResponse;
    if (data.type !== "file" || data.encoding !== "base64" || typeof data.content !== "string") {
      throw new Error(`GitHub returned an unsupported or incomplete content payload for "${file.path}"; analysis aborted.`);
    }

    const encodedContent = data.content.replace(/\s/g, "");
    const validBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (encodedContent.length % 4 !== 0 || !validBase64.test(encodedContent)) {
      throw new Error(`GitHub returned malformed base64 content for "${file.path}"; analysis aborted.`);
    }

    return { path: file.path, content: Buffer.from(encodedContent, "base64").toString("utf-8") };
  }));
}
