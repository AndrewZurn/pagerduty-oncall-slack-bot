# Copyright 2020 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM node:14-slim as builder
WORKDIR /src

# Install app dependencies.
COPY package.json ./package.json
RUN npm install

FROM gcr.io/distroless/nodejs14
WORKDIR /src

# Bundle app source.
COPY bot.js /src
COPY --from=builder /src/node_modules /src/node_modules

EXPOSE 8080

CMD ["bot"]
