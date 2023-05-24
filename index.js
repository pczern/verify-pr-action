const core = require("@actions/core");
const github = require("@actions/github");
const { Octokit } = require("octokit");

const octokit = new Octokit({ auth: core.getInput("repo-token") });

const KEY_TITLE_REGEX = "titleRegex";
const KEY_DESCRIPTION_REGEX = "descriptionRegex";
const KEY_TITLE_MIN_LENGTH = "titleMinLength";
const KEY_DESCRIPTION_MIN_LENGTH = "descriptionMinLength";
const GET_LABELS_QUERY = `query getLabelQuery($repositoryId: ID!){
	node(id: $repositoryId){
    ... on Repository {
      labels(first: 100) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
}`;
const SET_PR_DRAFT_AND_UPDATE_PR_LABELS_MUTATION = `mutation UpdatePullRequestMutation($pullRequestId:ID!, $labelIds:[ID!]) {
  updatePullRequest(input:{pullRequestId:$pullRequestId, labelIds:$labelIds}){pullRequest {
    id
  }}
  convertPullRequestToDraft(input:{pullRequestId:$pullRequestId}){pullRequest {
    id
  }}
}`;
const UPDATE_PR_LABELS_MUTATION = `mutation UpdatePullRequestMutation($pullRequestId:ID!, $labelIds:[ID!]) {
  updatePullRequest(input:{pullRequestId:$pullRequestId, labelIds:$labelIds}){pullRequest {
    id
  }}
}`;

const LABEL_TITLE_FORMAT = "Fix Title Format";
const LABEL_DESCRIPTION_FORMAT = "Fix Description Format";
const LABEL_TITLE_LENGTH = "Title Too Small";
const LABEL_DESCRIPTION_LENGTH = "Description Too Small";
const LABEL_MERGE_CONFLICTS = "Merge Conflicts";
const LABEL_VERIFIED = "Verified";

const allLabels = [
  LABEL_TITLE_FORMAT,
  LABEL_DESCRIPTION_FORMAT,
  LABEL_TITLE_LENGTH,
  LABEL_DESCRIPTION_LENGTH,
  LABEL_MERGE_CONFLICTS,
  LABEL_VERIFIED,
];
async function action() {
  try {
    const titleRegex = new RegExp(core.getInput(KEY_TITLE_REGEX));
    const descriptionRegex = new RegExp(core.getInput(KEY_DESCRIPTION_REGEX));
    const titleMinLength = core.getInput(KEY_TITLE_MIN_LENGTH);
    const descriptionMinLength = core.getInput(KEY_DESCRIPTION_MIN_LENGTH);

    const payload = github.context.payload;
    console.log(JSON.stringify(payload));
    const pullRequestId = payload.pull_request.node_id;
    const pullRequestMergeable = payload.pull_request.mergeable;
    const repositoryId = payload.repository.node_id;
    const repositoryUrl = payload.repository.url;
    const repositoryName = payload.repository.name;
    const repositoryOwnerLogin = payload.repository.owner.login;
    const labelIds = payload.pull_request.labels
      .filter((label) => !allLabels.includes(label.name))
      .map((label) => label.node_id);

    const createLabel = async (name, color) =>
      octokit.request(`POST ${repositoryUrl}/labels`, {
        owner: repositoryOwnerLogin,
        repo: repositoryName,
        name,
        color,
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    const errors = [];

    if (!titleRegex.exec(payload.pull_request.title)) {
      errors.push({
        name: LABEL_TITLE_FORMAT,
        description: "Title doesn't match Regex!",
      });
    }
    if (!descriptionRegex.exec(payload.pull_request.body)) {
      errors.push({
        name: LABEL_DESCRIPTION_FORMAT,
        description: "Description doesn't match Regex!",
      });
    }
    if (payload.pull_request.title.length < titleMinLength) {
      errors.push({
        name: LABEL_TITLE_LENGTH,
        description: "Title isn't long enough!",
      });
    }
    if (payload.pull_request?.description?.length < descriptionMinLength) {
      errors.push({
        name: LABEL_DESCRIPTION_LENGTH,
        description: "Description isn't long enough!",
      });
    }
    if (!pullRequestMergeable) {
      errors.push({
        name: LABEL_MERGE_CONFLICTS,
        description: "There are Merge Conflicts!",
      });
    }

    const isError = errors.length > 0;
    try {
      // creates labels or throws error because already created
      if (isError) {
        await Promise.all([
          createLabel(LABEL_TITLE_FORMAT, "ff0000"),
          createLabel(LABEL_DESCRIPTION_FORMAT, "ff0000"),
          createLabel(LABEL_TITLE_LENGTH, "ff0000"),
          createLabel(LABEL_DESCRIPTION_LENGTH, "ff0000"),
          createLabel(LABEL_MERGE_CONFLICTS, "ff0000"),
        ]);
      } else {
        await createLabel(LABEL_VERIFIED, "00ff00");
      }
    } catch {}

    const data = await octokit.graphql(GET_LABELS_QUERY, {
      repositoryId,
    });
    const settableLabels = data.node.labels.edges
      .map(({ node }) => node)
      .filter((label) =>
        isError
          ? errors.map((error) => error.name).includes(label.name)
          : label.name === LABEL_VERIFIED
      )
      .map((label) => label.id)
      .concat(labelIds);

    await octokit.graphql(
      isError
        ? SET_PR_DRAFT_AND_UPDATE_PR_LABELS_MUTATION
        : UPDATE_PR_LABELS_MUTATION,
      {
        pullRequestId,
        labelIds: settableLabels,
      }
    );
    if (isError)
      throw new Error(
        `Action failed:\n${errors.map((error) => error.description).join("\n")}`
      );
  } catch (error) {
    core.setFailed(error.message);
  }
}

action();
