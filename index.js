const core = require("@actions/core");
const github = require("@actions/github");
const { Octokit } = require("octokit");

const octokit = new Octokit({ auth: core.getInput("repo-token") });

const KEY_TITLE_REGEX = "titleRegex";
const KEY_DESCRIPTION_REGEX = "descriptionRegex";
const KEY_TITLE_MIN_LENGTH = "titleMinLength";
const KEY_DESCRIPTION_MIN_LENGTH = "descriptionMinLength";
const GET_LABELS_QUERY = `query GetLabelsQuery(pullRequestId:$pullRequestId){
	node(id: "PR_kwDOJmGuoM5RC3aC"){
    ... on PullRequest {
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
const UPDATE_PULL_REQUEST_MUTATION = `mutation UpdatePullRequestMutation($pullRequestId:ID!, $labelIds:[ID!]) {
  updatePullRequest(input:{pullRequestId:$pullRequestId, labelIds:$labelIds})
  convertPullRequestToDraft(input:{pullRequestId:$pullRequestId})
}`;

const LABEL_TITLE_FORMAT = "Fix Title Format";
const LABEL_DESCRIPTION_FORMAT = "Fix Description Format";
const LABEL_TITLE_LENGTH = "Title Too Small";
const LABEL_DESCRIPTION_LENGTH = "Description Too Small";
const allLabels = [
  LABEL_TITLE_FORMAT,
  LABEL_DESCRIPTION_FORMAT,
  LABEL_TITLE_LENGTH,
  LABEL_DESCRIPTION_LENGTH,
];
async function action() {
  try {
    const titleRegex = new RegExp(core.getInput(KEY_TITLE_REGEX));
    const descriptionRegex = new RegExp(core.getInput(KEY_DESCRIPTION_REGEX));
    const titleMinLength = core.getInput(KEY_TITLE_MIN_LENGTH);
    const descriptionMinLength = core.getInput(KEY_DESCRIPTION_MIN_LENGTH);

    const time = new Date().toTimeString();
    core.setOutput("time", time);
    const payload = JSON.stringify(github.context.payload, undefined, 2);
    console.log(`The event payload: ${payload}`);

    const pullRequestId = payload.pull_request.base.head.id;
    const pullRequestRepositoryUrl = payload.pull_request.repository.url;
    const pullRequestRepositoryName = payload.pull_request.repository.name;
    const pullRequestRepositoryOwnerLogin =
      payload.pull_request.repository.owner.login;

    const createLabel = async (name) => {
      const response = await octokit.request(
        `POST ${pullRequestRepositoryUrl}/labels`,
        {
          owner: pullRequestRepositoryOwnerLogin,
          repo: pullRequestRepositoryName,
          name,
          color: "ff0000",
          headers: {
            "X-GitHub-Api-Version": "2022-11-28",
          },
        }
      );
      console.log(response);
      return response?.node_id;
    };

    const errors = [];
    const newLabelIds = [];

    if (!titleRegex.exec(payload.pull_request.title)) {
      errors.push("Title doesn't match Regex!");
      labels.push(await createLabel(LABEL_TITLE_FORMAT));
    }
    if (!descriptionRegex.exec(payload.pull_request.body)) {
      errors.push("Description doesn't match Regex!");
      labels.push(await createLabel(LABEL_DESCRIPTION_FORMAT));
    }
    if (payload.pull_request.title.length < titleMinLength) {
      errors.push("Title isn't long enough!");
      labels.push(await createLabel(LABEL_TITLE_LENGTH));
    }
    if (payload.pull_request?.description?.length < descriptionMinLength) {
      errors.push("Description isn't long enough!");
      labels.push(await createLabel(LABEL_DESCRIPTION_LENGTH));
    }

    const { data } = await octokit.graphql(GET_LABELS_QUERY, {
      pullRequestId,
    });
    const labelIds = data.node.labels.edges
      .filter(({ node: label }) => !allLabels.includes(label.name))
      .map((label) => label.id);

    if (errors.length > 0) {
      console.log(labelIds, pullRequestId);
      await octokit.graphql(GRAPHQL_QUERY, {
        pullRequestId,
        labelIds: labelIds.concat(newLabelIds),
      });

      throw new Error(errors.join("\n"));
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

action();
